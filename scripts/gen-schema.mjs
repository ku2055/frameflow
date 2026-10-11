// Generates schema/scene.schema.json from the node property tables (single source of truth).
import { writeFileSync, mkdirSync } from 'node:fs';
import { NODE_PROPS } from '../dist/core/validate.js';
import { easeNames } from '../dist/core/easing.js';
import { presetNames } from '../dist/core/presets.js';

const ease = {
  description: 'Easing: a name, "cubic-bezier(x1,y1,x2,y2)", or { "spring": { "damping": 12 } }',
  oneOf: [
    { enum: easeNames },
    { type: 'string', pattern: '^cubic-bezier\\(' },
    { type: 'object', required: ['spring'], properties: { spring: { type: 'object', properties: { mass: { type: 'number' }, stiffness: { type: 'number' }, damping: { type: 'number' } }, additionalProperties: false } }, additionalProperties: false },
  ],
};
const anim = (scalar, desc) => ({
  description: `${desc} Constant, tween { from, to, at, dur, ease } or keyframes { "0": a, "1.5": b, "ease": "..." }. Times in seconds relative to the node start.`,
  oneOf: [
    scalar,
    { type: 'object', required: ['from', 'to'], properties: { from: scalar, to: scalar, at: { type: 'number', minimum: 0 }, dur: { type: 'number', minimum: 0 }, ease: { $ref: '#/$defs/ease' } }, additionalProperties: false },
    { type: 'object', minProperties: 1, propertyNames: { pattern: '^(ease|[0-9]+(\\.[0-9]+)?)$' }, additionalProperties: true },
  ],
});
const num = { type: 'number' };
const len = { oneOf: [{ type: 'number' }, { type: 'string', pattern: '^-?[0-9.]+%$' }] };
const color = { type: 'string', description: 'Hex (#38bdf8), rgb()/rgba(), or a basic color name' };
const gradient = { $ref: '#/$defs/gradient' };
const paintAnim = (d) => ({ oneOf: [anim(color, d), gradient] });

const propSchemas = {
  id: { type: 'string' }, start: { type: 'number', minimum: 0, description: 'Seconds after the parent starts' },
  duration: { type: 'number', exclusiveMinimum: 0, description: 'Seconds. Default: until the parent ends' },
  x: anim(len, 'Horizontal position (px or "50%"). Default: frame center.'), y: anim(len, 'Vertical position (px or "50%"). Default: frame center.'),
  anchor: { enum: ['center', 'top', 'bottom', 'left', 'right', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'] },
  opacity: anim(num, 'Opacity 0..1.'), scale: anim(num, 'Uniform scale.'), scaleX: anim(num, 'Horizontal scale.'), scaleY: anim(num, 'Vertical scale.'),
  rotate: anim(num, 'Rotation in degrees.'), blur: anim(num, 'Blur radius in px.'),
  shadow: { type: 'object', properties: { color, blur: num, x: num, y: num }, additionalProperties: false },
  enter: { $ref: '#/$defs/preset' }, exit: { $ref: '#/$defs/preset' },
  text: { type: 'string' }, size: anim(num, 'Font size in px.'), color: paintAnim('Text/line color.'), font: { type: 'string' },
  weight: { oneOf: [{ type: 'string' }, { type: 'number' }] }, italic: { type: 'boolean' }, align: { enum: ['left', 'center', 'right'] },
  maxWidth: len, lineHeight: num, letterSpacing: num, stroke: color, strokeWidth: num,
  w: anim(len, 'Width.'), h: anim(len, 'Height.'), fill: paintAnim('Fill color or gradient.'), radius: anim(num, 'Corner radius.'),
  r: anim(num, 'Radius.'), points: { type: 'array', minItems: 2, items: { type: 'array', items: num, minItems: 2, maxItems: 2 } },
  width: anim(num, 'Line width.'), progress: anim(num, '0..1 portion of the line drawn.'), cap: { enum: ['butt', 'round', 'square'] },
  d: { type: 'string', description: 'SVG path data' }, src: { type: 'string' }, fit: { enum: ['cover', 'contain', 'fill'] },
  children: { type: 'array', items: { $ref: '#/$defs/node' } },
};
const BASE = ['id', 'start', 'duration', 'x', 'y', 'anchor', 'opacity', 'scale', 'scaleX', 'scaleY', 'rotate', 'blur', 'shadow', 'enter', 'exit'];
const nodeDefs = {};
for (const [type, spec] of Object.entries(NODE_PROPS)) {
  const keys = [...BASE, ...spec.required, ...spec.optional];
  const properties = { type: { const: type } };
  for (const k of keys) properties[k] = k === 'color' && type === 'line' ? anim(color, 'Line color.') : propSchemas[k];
  nodeDefs[type] = { type: 'object', required: ['type', ...spec.required], properties, additionalProperties: false };
}

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/ku2055/frameflow/schema/scene.schema.json',
  title: 'Frameflow scene',
  description: 'A Frameflow video. All times are in seconds.',
  type: 'object',
  required: ['children'],
  properties: {
    $schema: { type: 'string' },
    type: { const: 'video' },
    width: { type: 'integer', minimum: 2, multipleOf: 2, default: 1920 },
    height: { type: 'integer', minimum: 2, multipleOf: 2, default: 1080 },
    fps: { type: 'number', minimum: 1, maximum: 240, default: 30 },
    duration: { type: 'number', exclusiveMinimum: 0, description: 'Seconds. Default: inferred from content + 1s' },
    background: { oneOf: [color, gradient] },
    font: { type: 'string' },
    fonts: { type: 'object', additionalProperties: { type: 'string' }, description: '{ "Family": "path/to/font.ttf" }' },
    audio: { type: 'array', items: { type: 'object', required: ['src'], properties: { src: { type: 'string' }, start: num, trim: num, volume: num, fadeIn: num, fadeOut: num }, additionalProperties: false } },
    children: { type: 'array', items: { $ref: '#/$defs/node' } },
  },
  additionalProperties: false,
  $defs: {
    ease,
    gradient: { type: 'object', required: ['type', 'stops'], properties: { type: { enum: ['linear', 'radial'] }, angle: num, stops: { type: 'array', items: { type: 'array', prefixItems: [num, color], minItems: 2, maxItems: 2 } } }, additionalProperties: false },
    preset: { oneOf: [{ enum: presetNames }, { type: 'object', required: ['type'], properties: { type: { enum: presetNames }, dur: num, ease: { $ref: '#/$defs/ease' }, distance: num, delay: num }, additionalProperties: false }] },
    node: { oneOf: Object.keys(nodeDefs).map((t) => ({ $ref: `#/$defs/${t}` })) },
    ...nodeDefs,
  },
};
mkdirSync('schema', { recursive: true });
writeFileSync('schema/scene.schema.json', JSON.stringify(schema, null, 2) + '\n');
console.log('wrote schema/scene.schema.json');
