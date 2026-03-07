#!/usr/bin/env python3
"""
Adobe Acrobat automation helper with built-in timeouts.

All operations have a default timeout of 10 seconds. Modal dialogs or
hanging AppleScript calls will be killed rather than blocking forever.

Usage:
    # Open a PDF and take a screenshot
    python3 scripts/adobe-auto.py open <pdf_path> [--screenshot /tmp/out.png]

    # Run JavaScript in Acrobat (non-blocking — returns result or timeout)
    python3 scripts/adobe-auto.py js "this.numPages"

    # Take a screenshot of the frontmost Acrobat window
    python3 scripts/adobe-auto.py screenshot [/tmp/out.png]

    # List all Acrobat windows
    python3 scripts/adobe-auto.py windows

    # Close frontmost document
    python3 scripts/adobe-auto.py close

    # Get signature info from open document
    python3 scripts/adobe-auto.py siginfo

    # Validate: open PDF, wait for sig validation, screenshot, report
    python3 scripts/adobe-auto.py validate <pdf_path> [/tmp/out.png]

    # Diagnostic: test all automation APIs
    python3 scripts/adobe-auto.py diagnose

API Capabilities (from diagnostic testing):
    RELIABLE (< 0.2s):
        - Quartz CGWindowListCopyWindowInfo: window IDs, names, bounds, onscreen
        - screencapture -l <wid>: pixel-perfect window screenshot
        - AppleScript activate: bring Acrobat to front
        - AppleScript do script: run JS expressions (single or multi-statement)
        - System Events process check: exists, name lookup
        - open -a: open PDF files (non-blocking)

    WORKS WITH CAVEATS:
        - JS bridge (do script): Use SINGLE QUOTES inside JS to avoid
          AppleScript escaping issues. Multi-statement JS works fine.
          NEVER use app.alert() or any dialog-showing JS — it blocks
          the AppleScript bridge synchronously.
        - System Events windows: Use `first process whose name contains
          "Acrobat"` (NOT `process "AdobeAcrobat"` with `window 1`).

    LIMITED / UNRELIABLE:
        - System Events UI elements: Only returns window chrome buttons
          (close/minimize/maximize). Actual Acrobat content, toolbars,
          and signature banners are NOT in the accessibility tree.
        - System Events `get name of every document`: Unreliable.
"""
import sys
import os
import time
import subprocess
import threading
import json


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ACROBAT_APP = "/Applications/Adobe Acrobat DC/Adobe Acrobat.app"
DEFAULT_TIMEOUT = 10  # seconds


# ---------------------------------------------------------------------------
# Timeout helpers
# ---------------------------------------------------------------------------

def run_osascript(script, timeout=DEFAULT_TIMEOUT, label="osascript"):
    """Run an AppleScript with a subprocess timeout. Never hangs."""
    try:
        proc = subprocess.run(
            ['osascript', '-e', script],
            capture_output=True, text=True, timeout=timeout
        )
        if proc.returncode != 0:
            return False, f"ERROR ({label}): {proc.stderr.strip()}"
        return True, proc.stdout.strip()
    except subprocess.TimeoutExpired:
        return False, f"TIMEOUT after {timeout}s: {label}"
    except Exception as e:
        return False, f"ERROR ({label}): {e}"


# ---------------------------------------------------------------------------
# Quartz window helpers (no timeout needed — pure local API, < 100ms)
# ---------------------------------------------------------------------------

def get_acrobat_windows(include_offscreen=False):
    """Get Acrobat windows via Quartz. Fast, never hangs."""
    import Quartz
    flag = (Quartz.kCGWindowListOptionAll if include_offscreen
            else Quartz.kCGWindowListOptionOnScreenOnly)
    windows = Quartz.CGWindowListCopyWindowInfo(flag, Quartz.kCGNullWindowID)
    results = []
    for w in windows:
        owner = w.get('kCGWindowOwnerName', '')
        if 'Acrobat' not in owner:
            continue
        name = w.get('kCGWindowName', '')
        wid = w.get('kCGWindowNumber', 0)
        layer = w.get('kCGWindowLayer', -1)
        bounds = w.get('kCGWindowBounds', {})
        width = int(bounds.get('Width', 0))
        height = int(bounds.get('Height', 0))
        on_screen = bool(w.get('kCGWindowIsOnscreen', False))
        results.append({
            'wid': wid, 'name': name, 'layer': layer,
            'width': width, 'height': height, 'on_screen': on_screen,
        })
    return results


def get_main_window():
    """Get the main content window (layer 0, has name, >100px)."""
    windows = get_acrobat_windows(include_offscreen=True)
    # Prefer window with a .pdf name
    for w in windows:
        if (w['layer'] == 0 and w['width'] > 100 and w['height'] > 100
                and w['name'] and '.pdf' in w['name'].lower()):
            return w
    # Fallback to any named window
    for w in windows:
        if w['layer'] == 0 and w['width'] > 100 and w['height'] > 100 and w['name']:
            return w
    return None


def get_dialog_windows():
    """Detect Acrobat dialog/popup windows (update prompts, trust warnings, etc.).

    Only considers ON-SCREEN, named windows that aren't document windows or
    the main Acrobat home screen. Conservative to avoid false positives on
    internal framework windows.
    """
    windows = get_acrobat_windows(include_offscreen=False)  # on-screen only
    dialogs = []
    for w in windows:
        # Skip tiny windows (menu bar overlays, tooltips)
        if w['width'] < 100 or w['height'] < 80:
            continue
        # Skip non-layer-0 (floating panels)
        if w['layer'] != 0:
            continue
        name = w['name'] or ''
        # Skip document windows (.pdf in name)
        if '.pdf' in name.lower():
            continue
        # Skip the main Acrobat home window (name is exactly 'Acrobat' or 'Adobe Acrobat')
        if name.lower() in ('acrobat', 'adobe acrobat', 'adobe acrobat dc', ''):
            continue
        # Remaining named, on-screen, layer-0 windows are likely dialogs
        # (e.g. "Software Update", "Certificate Trust", "Save As", etc.)
        dialogs.append(w)
    return dialogs


def dismiss_dialogs(timeout=DEFAULT_TIMEOUT):
    """Dismiss any open Acrobat dialogs by sending Escape and Return keystrokes.

    Handles two types of dialogs:
    1. Separate Quartz windows (detected by get_dialog_windows)
    2. In-window sheet/modal dialogs (e.g. "error processing page" OK alerts)
       — these are NOT separate windows, so we also send a few Return keystrokes
       speculatively to clear any sheet dialogs that might be present.

    Returns (bool, str) — True if all dialogs were dismissed.
    """
    dismissed = 0

    # Phase 1: Dismiss separate dialog windows (detected via Quartz)
    for attempt in range(5):
        dialogs = get_dialog_windows()
        if not dialogs:
            break

        # Try Escape first (closes most dialogs without side effects)
        run_osascript(
            'tell application "System Events" to tell '
            '(first process whose name contains "Acrobat") to '
            'keystroke (ASCII character 27)',  # Escape
            timeout=timeout, label="dismiss-escape"
        )
        time.sleep(0.3)

        # Check if dialog is still there
        remaining = get_dialog_windows()
        if len(remaining) < len(dialogs):
            dismissed += len(dialogs) - len(remaining)
            continue

        # Escape didn't work — try Return (clicks default button)
        run_osascript(
            'tell application "System Events" to tell '
            '(first process whose name contains "Acrobat") to '
            'keystroke return',
            timeout=timeout, label="dismiss-return"
        )
        time.sleep(0.3)
        dismissed += 1

    # Phase 2: Speculatively dismiss in-window sheet dialogs (not visible
    # as separate Quartz windows). Send Return twice with a pause to catch
    # stacked "error processing page" alerts.
    for _ in range(2):
        run_osascript(
            'tell application "System Events" to tell '
            '(first process whose name contains "Acrobat") to '
            'keystroke return',
            timeout=timeout, label="dismiss-sheet"
        )
        time.sleep(0.3)

    final_dialogs = get_dialog_windows()
    if final_dialogs:
        return False, f"Could not dismiss {len(final_dialogs)} dialog(s): {[d['name'] for d in final_dialogs]}"
    return True, f"Dismissed {dismissed} dialog(s) + cleared sheets"


# ---------------------------------------------------------------------------
# Core automation functions
# ---------------------------------------------------------------------------

def activate_acrobat(timeout=DEFAULT_TIMEOUT):
    """Bring Acrobat to the front."""
    return run_osascript(
        'tell application "Adobe Acrobat" to activate',
        timeout=timeout, label="activate"
    )


def open_pdf(pdf_path, timeout=DEFAULT_TIMEOUT):
    """Open a PDF in Acrobat and wait for its window to appear.

    Window detection uses three strategies:
    1. Match by filename in window title (common case)
    2. Detect any NEW window ID that appeared after opening
    3. Check JS bridge for document filename (handles PDFs whose document
       title differs from the filename, e.g. Google Docs exports where the
       window shows the PDF title metadata instead of the filename)
    """
    abs_path = os.path.abspath(pdf_path)
    if not os.path.exists(abs_path):
        return False, f"File not found: {abs_path}"

    basename = os.path.basename(abs_path)

    # Snapshot existing window IDs before opening
    existing_wids = {w['wid'] for w in get_acrobat_windows(include_offscreen=True)}

    # Open the PDF in Acrobat. This briefly steals focus but is reliable.
    # (open -g background mode doesn't reliably create Acrobat windows.)
    subprocess.run(['open', '-a', ACROBAT_APP, abs_path], check=True)

    # Poll for window to appear
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(0.5)
        windows = get_acrobat_windows(include_offscreen=True)
        for w in windows:
            # Strategy 1: filename match in window title
            if basename in w['name'] and w['layer'] == 0:
                return True, w
        # Strategy 2: detect new main window by ID
        for w in windows:
            if w['wid'] not in existing_wids and w['layer'] == 0 and w['width'] > 100:
                return True, w
        # Strategy 3: JS bridge confirms document loaded (handles reused window
        # where title shows PDF metadata instead of filename)
        ok, val = run_javascript("this.documentFileName", timeout=3)
        if ok and basename in val:
            # Find the main content window
            main = get_main_window()
            if main:
                return True, main

    return False, f"TIMEOUT after {timeout}s: window for {basename} did not appear"


def close_document(timeout=DEFAULT_TIMEOUT):
    """Close the frontmost document in Acrobat via Cmd+W."""
    return run_osascript(
        'tell application "System Events" to tell '
        '(first process whose name contains "Acrobat") to '
        'keystroke "w" using command down',
        timeout=timeout, label="close document"
    )


def run_javascript(js_code, timeout=DEFAULT_TIMEOUT):
    """Execute JavaScript in Acrobat via AppleScript `do script`.

    IMPORTANT RULES:
    - Use SINGLE QUOTES inside JS strings (not double quotes)
      Good:  this.getField('Signature1')
      Bad:   this.getField("Signature1")  -- breaks AppleScript escaping
    - NEVER use app.alert(), app.response(), or any dialog-showing JS
      These create modal dialogs that block the AppleScript bridge.
    - Multi-statement JS works: "var x = 1 + 1; x"
    - Keep JS short and non-interactive.
    """
    # Escape backslashes and double quotes for AppleScript string embedding
    escaped = js_code.replace('\\', '\\\\').replace('"', '\\"')
    script = f'tell application "Adobe Acrobat" to do script "{escaped}"'
    return run_osascript(script, timeout=timeout, label=f"js: {js_code[:60]}")


def screenshot_window(wid=None, output_path='/tmp/adobe-screenshot.png'):
    """Capture a screenshot of a specific Acrobat window (or auto-detect)."""
    if wid is None:
        main = get_main_window()
        if main is None:
            return False, "No Acrobat window found"
        wid = main['wid']

    try:
        subprocess.run(
            ['screencapture', '-l', str(wid), '-x', output_path],
            check=True, timeout=DEFAULT_TIMEOUT
        )
        if os.path.exists(output_path):
            size = os.path.getsize(output_path)
            return True, f"Saved {output_path} ({size} bytes, wid={wid})"
        return False, "Screenshot file not created"
    except subprocess.TimeoutExpired:
        return False, "TIMEOUT: screencapture hung"
    except Exception as e:
        return False, f"ERROR: {e}"


# ---------------------------------------------------------------------------
# Signature inspection (via JS bridge — use single quotes!)
# ---------------------------------------------------------------------------

def get_num_sig_fields(timeout=DEFAULT_TIMEOUT):
    """Count signature fields in the open document."""
    js = (
        "var count = 0; "
        "for (var i = 0; i < this.numFields; i++) { "
        "  var f = this.getField(this.getNthFieldName(i)); "
        "  if (f && f.type == 'signature') count++; "
        "} count"
    )
    return run_javascript(js, timeout=timeout)


def get_sig_field_names(timeout=DEFAULT_TIMEOUT):
    """Get names of all signature fields."""
    js = (
        "var names = []; "
        "for (var i = 0; i < this.numFields; i++) { "
        "  var n = this.getNthFieldName(i); "
        "  var f = this.getField(n); "
        "  if (f && f.type == 'signature') names.push(n); "
        "} names.join(',')"
    )
    return run_javascript(js, timeout=timeout)


def get_sig_validate(field_name='Signature1', timeout=DEFAULT_TIMEOUT):
    """Validate a signature field. Returns status code.

    Status codes (signatureValidate return values):
        0 = signature is valid
        1 = identity is unknown/unverified
        2 = signature has been modified/invalid
        3 = signing time not within validity period
    """
    js = f"var f = this.getField('{field_name}'); f ? f.signatureValidate() : -1"
    return run_javascript(js, timeout=timeout)


def get_sig_info(field_name='Signature1', timeout=DEFAULT_TIMEOUT):
    """Get detailed signature info as a structured string.

    IMPORTANT: The local variable must NOT be named `info` — Acrobat JS has a
    global `info` object (the document Info dictionary) that shadows any local
    `var info`. Using `si` instead avoids this collision.
    """
    js = (
        f"var f = this.getField('{field_name}'); "
        "if (f) { "
        "  var si = f.signatureInfo(); "
        "  var v = f.signatureValidate(); "
        "  'validate=' + v + "
        "  '|name=' + (si.name || '') + "
        "  '|reason=' + (si.reason || '') + "
        "  '|date=' + (si.date || '') + "
        "  '|location=' + (si.location || ''); "
        "} else { 'field not found' }"
    )
    return run_javascript(js, timeout=timeout)


# ---------------------------------------------------------------------------
# High-level workflows
# ---------------------------------------------------------------------------

def validate_pdf(pdf_path, screenshot_path='/tmp/adobe-validate.png', timeout=DEFAULT_TIMEOUT):
    """Open a PDF, wait for Acrobat to validate signatures, and report.

    Returns a dict with:
        - opened: bool
        - window: dict or None
        - screenshot: str or None
        - num_pages: int or None
        - sig_fields: list of field names
        - sig_status: dict of {field_name: validate_code}
        - sig_info: dict of {field_name: info_string}
    """
    result = {
        'opened': False, 'window': None, 'screenshot': None,
        'num_pages': None, 'sig_fields': [], 'sig_status': {},
        'sig_info': {},
    }

    # Open
    ok, win = open_pdf(pdf_path, timeout=timeout)
    if not ok:
        result['error'] = win
        return result
    result['opened'] = True
    result['window'] = win

    # Adaptive wait: poll until Acrobat is responsive and sig fields are found.
    # Replaces the old fixed 3s sleep — handles slow PDFs and system load.
    max_wait = 15  # seconds
    poll_interval = 1.0  # seconds between polls
    deadline = time.time() + max_wait
    sig_fields_found = False

    while time.time() < deadline:
        time.sleep(poll_interval)

        # Dismiss any dialogs that popped up during load
        dismiss_dialogs(timeout=3)

        # Check if Acrobat is responsive via JS bridge
        ok, val = run_javascript("this.numPages", timeout=5)
        if ok and val.isdigit():
            result['num_pages'] = int(val)

            # Try to get signature field names
            ok, val = get_sig_field_names(timeout=5)
            if ok and val:
                result['sig_fields'] = [f.strip() for f in val.split(',') if f.strip()]
                if result['sig_fields']:
                    sig_fields_found = True
                    break
            else:
                # No sig fields yet — might still be loading, or PDF has no sigs
                # Give Acrobat one more second then break if numPages worked
                time.sleep(1)
                ok, val = get_sig_field_names(timeout=5)
                if ok and val:
                    result['sig_fields'] = [f.strip() for f in val.split(',') if f.strip()]
                sig_fields_found = bool(result['sig_fields'])
                break

    # If we never got numPages, try one final time
    if result['num_pages'] is None:
        dismiss_dialogs(timeout=3)
        ok, val = run_javascript("this.numPages", timeout=5)
        if ok and val.isdigit():
            result['num_pages'] = int(val)
        ok, val = get_sig_field_names(timeout=5)
        if ok and val:
            result['sig_fields'] = [f.strip() for f in val.split(',') if f.strip()]

    # Validate each signature
    for fname in result['sig_fields']:
        ok, val = get_sig_validate(fname, timeout=5)
        if ok:
            result['sig_status'][fname] = val
        ok, val = get_sig_info(fname, timeout=5)
        if ok:
            result['sig_info'][fname] = val

    # Screenshot
    ok, val = screenshot_window(win['wid'], screenshot_path)
    if ok:
        result['screenshot'] = screenshot_path

    return result


# ---------------------------------------------------------------------------
# Diagnostic
# ---------------------------------------------------------------------------

def diagnose():
    """Systematically test each automation API with timeouts."""
    results = []

    def test(name, fn):
        print(f"  Testing: {name}...", end=" ", flush=True)
        start = time.time()
        ok, result = fn()
        elapsed = time.time() - start
        status = "OK" if ok else "FAIL"
        print(f"{status} ({elapsed:.1f}s)")
        if ok:
            display = str(result)[:200]
            print(f"    -> {display}")
        else:
            print(f"    -> {result}")
        results.append((name, ok, elapsed, result))
        return ok

    print("=" * 60)
    print("Adobe Acrobat Automation Diagnostic")
    print("=" * 60)

    # 1. Process check
    print("\n1. PROCESS CHECK (Quartz — always reliable)")
    test("Quartz window list (all)", lambda: (True, get_acrobat_windows(include_offscreen=True)))
    test("Main window lookup", lambda: (
        (True, get_main_window()) if get_main_window() else (False, "No main window")
    ))

    # 2. AppleScript basics
    print("\n2. APPLESCRIPT BASICS")
    test("Activate Acrobat", lambda: activate_acrobat(timeout=5))
    test("Process exists (System Events)", lambda: run_osascript(
        'tell application "System Events" to exists process "AdobeAcrobat"',
        timeout=5, label="process exists"
    ))
    test("Window names (System Events)", lambda: run_osascript(
        'tell application "System Events" to tell '
        '(first process whose name contains "Acrobat") to '
        'get name of every window',
        timeout=5, label="window names"
    ))

    # 3. JavaScript bridge
    print("\n3. JAVASCRIPT BRIDGE (do script)")
    print("    NOTE: All calls use subprocess timeout — safe from hangs")
    test("Simple expression (1+1)", lambda: run_javascript("1+1", timeout=5))
    test("Multi-statement (var x=2; x*3)", lambda: run_javascript("var x=2; x*3", timeout=5))
    test("IIFE", lambda: run_javascript("(function(){return 42;})()", timeout=5))
    test("this.numPages", lambda: run_javascript("this.numPages", timeout=5))
    test("this.path", lambda: run_javascript("this.path", timeout=5))
    # Test single-quote approach for field names
    test("getField with single quotes", lambda: run_javascript(
        "this.getField('Signature1') ? 'found' : 'not found'", timeout=5
    ))

    # 4. Signature inspection
    has_doc = False
    ok, val = run_javascript("this.numPages", timeout=5)
    if ok and val and val != 'undefined':
        has_doc = True

    print("\n4. SIGNATURE INSPECTION" + ("" if has_doc else " (no document open — skipping)"))
    if has_doc:
        test("Sig field count", lambda: get_num_sig_fields(timeout=5))
        test("Sig field names", lambda: get_sig_field_names(timeout=5))
        test("Sig validate", lambda: get_sig_validate(timeout=5))
        test("Sig info", lambda: get_sig_info(timeout=5))

    # 5. Screenshot
    print("\n5. SCREENSHOT")
    test("Capture screenshot", lambda: screenshot_window(output_path='/tmp/adobe-diag.png'))

    # 6. Accessibility (limited — only window chrome)
    print("\n6. ACCESSIBILITY (System Events — limited in Acrobat)")
    test("Window UI elements", lambda: run_osascript(
        'tell application "System Events" to tell '
        '(first process whose name contains "Acrobat") to '
        'get {role, name} of every UI element of '
        '(first window whose name contains ".pdf")',
        timeout=5, label="UI elements"
    ))

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    ok_count = sum(1 for _, ok, _, _ in results if ok)
    fail_count = sum(1 for _, ok, _, _ in results if not ok)
    print(f"  Passed: {ok_count}  Failed: {fail_count}")
    for name, ok, elapsed, _ in results:
        icon = "PASS" if ok else "FAIL"
        print(f"  [{icon}] {name} ({elapsed:.1f}s)")

    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == 'diagnose':
        diagnose()

    elif cmd == 'windows':
        windows = get_acrobat_windows(include_offscreen=True)
        if not windows:
            print("No Acrobat windows found")
        for w in windows:
            flag = "ON " if w['on_screen'] else "OFF"
            print(f"  [{flag}] wid={w['wid']} {w['width']}x{w['height']} "
                  f"layer={w['layer']} name={w['name']!r}")

    elif cmd == 'open':
        if len(sys.argv) < 3:
            print("Usage: adobe-auto.py open <pdf_path> [--screenshot /tmp/out.png]")
            sys.exit(1)
        pdf_path = sys.argv[2]
        ok, result = open_pdf(pdf_path)
        if not ok:
            print(f"FAIL: {result}", file=sys.stderr)
            sys.exit(1)
        print(f"Opened: wid={result['wid']} name={result['name']!r}")

        if '--screenshot' in sys.argv:
            idx = sys.argv.index('--screenshot')
            out = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else '/tmp/adobe-screenshot.png'
            time.sleep(3)
            ok2, result2 = screenshot_window(result['wid'], out)
            print(f"Screenshot: {'OK' if ok2 else 'FAIL'} - {result2}")

    elif cmd == 'screenshot':
        out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/adobe-screenshot.png'
        ok, result = screenshot_window(output_path=out)
        print(f"{'OK' if ok else 'FAIL'}: {result}")

    elif cmd == 'js':
        if len(sys.argv) < 3:
            print("Usage: adobe-auto.py js <javascript_code>")
            sys.exit(1)
        js_code = sys.argv[2]
        ok, result = run_javascript(js_code, timeout=DEFAULT_TIMEOUT)
        print(f"{'OK' if ok else 'FAIL'}: {result}")

    elif cmd == 'close':
        ok, result = close_document()
        print(f"{'OK' if ok else 'FAIL'}: {result}")

    elif cmd == 'siginfo':
        ok, result = get_sig_info()
        if ok:
            # Parse structured output
            parts = result.split('|')
            for part in parts:
                print(f"  {part}")
        else:
            print(f"FAIL: {result}")

    elif cmd == 'dismiss':
        ok, result = dismiss_dialogs()
        print(f"{'OK' if ok else 'FAIL'}: {result}")

    elif cmd == 'validate':
        if len(sys.argv) < 3:
            print("Usage: adobe-auto.py validate <pdf_path> [screenshot_path]")
            sys.exit(1)
        pdf_path = sys.argv[2]
        screenshot_path = sys.argv[3] if len(sys.argv) > 3 else '/tmp/adobe-validate.png'
        print(f"Validating: {pdf_path}")
        result = validate_pdf(pdf_path, screenshot_path)
        print(f"  Opened: {result['opened']}")
        print(f"  Pages: {result['num_pages']}")
        print(f"  Sig fields: {result['sig_fields']}")
        for fname, status in result['sig_status'].items():
            print(f"  {fname} validate: {status}")
        for fname, info in result['sig_info'].items():
            print(f"  {fname} info: {info}")
        if result['screenshot']:
            print(f"  Screenshot: {result['screenshot']}")
        if 'error' in result:
            print(f"  Error: {result['error']}")

    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)
        sys.exit(1)


if __name__ == '__main__':
    main()
