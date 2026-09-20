import { z } from 'zod';

export type Category = 'timing' | 'broadcast' | 'race-control' | 'pit-lane';
export type ComponentMeta = {
  slug: string;
  name: string;
  category: Category;
  description: string;
  registryName: string;
  dependencies: string[];
  status: 'stable' | 'beta' | 'hidden';
};

type BaseField<T> = { label: string; description?: string; default: T };
export type BooleanControl = BaseField<boolean> & { kind: 'boolean' };
export type NumberControl = BaseField<number> & {
  kind: 'number';
  min: number;
  max: number;
  step: number;
};
export type SelectControl<T extends string = string> = BaseField<T> & {
  kind: 'select';
  options: readonly [T, ...T[]];
};
export type ColorControl = BaseField<string> & { kind: 'color' };
export type TextControl = BaseField<string> & { kind: 'text' };
export type ControlField =
  | BooleanControl
  | NumberControl
  | SelectControl
  | ColorControl
  | TextControl;
export type ControlSchema = Record<string, ControlField>;
export type ControlValues<T extends ControlSchema> = {
  [K in keyof T]: T[K] extends SelectControl<infer V>
    ? V
    : T[K] extends BooleanControl
      ? boolean
      : T[K] extends NumberControl
        ? number
        : string;
};

function fieldSchema(field: ControlField) {
  switch (field.kind) {
    case 'boolean':
      return z.boolean().default(field.default);
    case 'number':
      return z.number().min(field.min).max(field.max).multipleOf(field.step).default(field.default);
    case 'select':
      return z.enum(field.options).default(field.default);
    case 'color':
      return z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default(field.default);
    case 'text':
      return z.string().default(field.default);
  }
}

export function defineControls<const T extends ControlSchema>(fields: T) {
  const shape = Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, fieldSchema(field)]),
  );
  const schema = z.object(shape) as unknown as z.ZodType<ControlValues<T>>;
  const defaults = schema.parse(
    Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.default])),
  );
  return { fields, schema, defaults };
}
