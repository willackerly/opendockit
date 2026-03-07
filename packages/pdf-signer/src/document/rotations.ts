/**
 * Rotation types and conversion utilities.
 * Native implementation — structurally identical to pdf-lib's Rotation API.
 */

export enum RotationTypes {
  Degrees = 'degrees',
  Radians = 'radians',
}

export interface Radians {
  type: RotationTypes.Radians;
  angle: number;
}

export interface Degrees {
  type: RotationTypes.Degrees;
  angle: number;
}

export type Rotation = Radians | Degrees;

export const radians = (radianAngle: number): Radians => ({
  type: RotationTypes.Radians,
  angle: radianAngle,
});

export const degrees = (degreeAngle: number): Degrees => ({
  type: RotationTypes.Degrees,
  angle: degreeAngle,
});

export const degreesToRadians = (degree: number): number =>
  (degree * Math.PI) / 180;

export const radiansToDegrees = (radian: number): number =>
  (radian * 180) / Math.PI;

export const toRadians = (rotation: Rotation): number =>
  rotation.type === RotationTypes.Radians
    ? rotation.angle
    : degreesToRadians(rotation.angle);

export const toDegrees = (rotation: Rotation): number =>
  rotation.type === RotationTypes.Degrees
    ? rotation.angle
    : radiansToDegrees(rotation.angle);

export const reduceRotation = (
  degreeAngle = 0,
): 0 | 90 | 180 | 270 => {
  const angle = ((degreeAngle % 360) + 360) % 360;
  if (angle === 0 || angle === 90 || angle === 180 || angle === 270)
    return angle as 0 | 90 | 180 | 270;
  // Round to nearest valid rotation
  if (angle < 45) return 0;
  if (angle < 135) return 90;
  if (angle < 225) return 180;
  if (angle < 315) return 270;
  return 0;
};

export const adjustDimsForRotation = (
  dims: { width: number; height: number },
  degreeAngle = 0,
): { width: number; height: number } => {
  const r = reduceRotation(degreeAngle);
  return r === 90 || r === 270
    ? { width: dims.height, height: dims.width }
    : { width: dims.width, height: dims.height };
};
