import { useState } from 'react';
import type { ComponentType } from 'react';
import type { ComponentMeta, ControlField, ControlSchema } from '../../content/types';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { CodeBlock } from './code-block';
import { categoryNames } from '../../content';

type Value = boolean | number | string;
type Definition = {
  fields: ControlSchema;
  defaults: Record<string, Value>;
  schema: { safeParse: (value: Record<string, Value>) => { success: boolean } };
};

function ControlInput({
  name,
  field,
  value,
  change,
}: {
  name: string;
  field: ControlField;
  value: Value;
  change: (name: string, value: Value) => void;
}) {
  const id = `control-${name}`;
  return (
    <div className="space-y-2 border-b border-border pb-4 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-sm font-semibold">
          {field.label}
        </Label>
        {field.kind === 'number' && (
          <span className="font-mono text-xs text-muted-foreground">{value}</span>
        )}
      </div>
      {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
      {field.kind === 'boolean' && (
        <Switch
          id={id}
          checked={Boolean(value)}
          onCheckedChange={(checked) => change(name, checked)}
        />
      )}
      {field.kind === 'number' && (
        <Slider
          id={id}
          min={field.min}
          max={field.max}
          step={field.step}
          value={[Number(value)]}
          onValueChange={(next) => change(name, next[0] ?? field.default)}
        />
      )}
      {field.kind === 'select' && (
        <Select value={String(value)} onValueChange={(next) => change(name, next)}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {field.kind === 'color' && (
        <div className="flex items-center gap-3">
          <input
            id={id}
            type="color"
            value={String(value)}
            onChange={(event) => change(name, event.target.value)}
            className="h-9 w-12 cursor-pointer border border-border bg-transparent"
          />
          <span className="font-mono text-xs">{value}</span>
        </div>
      )}
      {field.kind === 'text' && (
        <Input
          id={id}
          value={String(value)}
          onChange={(event) => change(name, event.target.value)}
        />
      )}
    </div>
  );
}

function fieldType(field: ControlField) {
  if (field.kind === 'select') return field.options.map((option) => `'${option}'`).join(' | ');
  if (field.kind === 'color') return 'color';
  return field.kind === 'text' ? 'string' : field.kind;
}

export function ComponentPageBody({
  meta,
  definition,
  Demo,
  source,
}: {
  meta: ComponentMeta;
  definition: Definition;
  Demo: ComponentType<Record<string, Value>>;
  source: string;
}) {
  const [values, setValues] = useState<Record<string, Value>>(definition.defaults);
  const [manager, setManager] = useState<'bun' | 'pnpm' | 'npm'>('bun');
  const command = `${manager === 'bun' ? 'bunx' : manager === 'pnpm' ? 'pnpm dlx' : 'npx'} shadcn@latest add @boxbox/${meta.registryName}`;
  function change(name: string, value: Value) {
    const next = { ...values, [name]: value };
    if (definition.schema.safeParse(next).success) setValues(next);
  }
  return (
    <article className="space-y-14">
      <header>
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge variant="outline">{categoryNames[meta.category]}</Badge>
          <Badge variant={meta.status === 'stable' ? 'default' : 'secondary'}>{meta.status}</Badge>
        </div>
        <h1 className="font-display text-5xl font-black tracking-tight md:text-6xl">{meta.name}</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{meta.description}</p>
      </header>
      <section aria-labelledby="preview-title">
        <h2 id="preview-title" className="mb-5 font-display text-3xl font-bold tracking-tight">
          Preview
        </h2>
        <div className="grid border border-border xl:grid-cols-[minmax(0,1fr)_280px]">
          {/*
            The stage stands in for a broadcast feed, so it stays dark in both
            themes. Scoping it with `dark` makes the tokens inside match the
            stage; without it the light theme paints a white component on black.
          */}
          <div className="dark flex min-h-80 items-center justify-center bg-background p-8 text-foreground">
            <Demo {...values} />
          </div>
          <div className="border-t border-border bg-card p-5 xl:border-l xl:border-t-0">
            <h3 className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Playground
            </h3>
            <div className="space-y-4">
              {Object.entries(definition.fields).map(([name, field]) => (
                <ControlInput
                  key={name}
                  name={name}
                  field={field}
                  value={values[name] ?? field.default}
                  change={change}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
      <section aria-labelledby="installation-title">
        <h2 id="installation-title" className="mb-5 font-display text-3xl font-bold tracking-tight">
          Installation
        </h2>
        <Tabs defaultValue="cli">
          <TabsList>
            <TabsTrigger value="cli">CLI</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
          </TabsList>
          <TabsContent value="cli" className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Package manager</span>
              <Select
                value={manager}
                onValueChange={(value) => setManager(value as 'bun' | 'pnpm' | 'npm')}
              >
                <SelectTrigger className="w-32" aria-label="Package manager">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bun">bun</SelectItem>
                  <SelectItem value="pnpm">pnpm</SelectItem>
                  <SelectItem value="npm">npm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CodeBlock code={command} language="bash" />
          </TabsContent>
          <TabsContent value="manual">
            <p className="mb-3 text-sm text-muted-foreground">
              Copy the source into your project, then install its dependencies.
            </p>
            <CodeBlock code={source} language="tsx" />
          </TabsContent>
        </Tabs>
      </section>
      <section aria-labelledby="props-title">
        <h2 id="props-title" className="mb-5 font-display text-3xl font-bold tracking-tight">
          Props
        </h2>
        <div className="overflow-x-auto border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(definition.fields).map(([name, field]) => (
                <TableRow key={name}>
                  <TableCell className="font-mono">{name}</TableCell>
                  <TableCell className="font-mono text-xs">{fieldType(field)}</TableCell>
                  <TableCell className="font-mono text-xs">{String(field.default)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {field.description ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      <section aria-labelledby="dependencies-title">
        <h2 id="dependencies-title" className="mb-5 font-display text-3xl font-bold tracking-tight">
          Dependencies
        </h2>
        {meta.dependencies.length ? (
          <ul className="space-y-2 font-mono text-sm">
            {meta.dependencies.map((dependency) => (
              <li key={dependency} className="border-l-2 border-border pl-3">
                {dependency}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No additional dependencies.</p>
        )}
      </section>
    </article>
  );
}
