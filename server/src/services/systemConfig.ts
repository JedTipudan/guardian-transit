import { Prisma, type SystemConfig } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Hotline numbers are operator-configurable — they are never hard-coded in the
 * client bundle. Keys are stable so older sessions keep working after a change.
 */
export interface Hotline {
  key: string;
  label: string;
  number: string;
  description?: string;
  available24h?: boolean;
}

export const HOTLINE_DEFAULTS: Hotline[] = [
  {
    key: 'hotline.emergency',
    label: 'Emergency hotline',
    number: '911',
    description: 'Police, fire and ambulance — use when there is immediate danger to life.',
    available24h: true,
  },
  {
    key: 'hotline.dispatch',
    label: 'Guardian Transit dispatch',
    number: '+63 917 555 0100',
    description: '24/7 operations desk — ride issues, driver concerns and live trip support.',
    available24h: true,
  },
  {
    key: 'hotline.safety',
    label: 'Student safety desk',
    number: '+63 917 555 0111',
    description: 'Reports about driver behaviour, vehicle condition or route deviations.',
    available24h: false,
  },
];

export const SOS_MESSAGE_DEFAULT =
  'I need help. My live location is being shared with the Guardian Transit safety desk.';

async function readAll(): Promise<SystemConfig[]> {
  return prisma.systemConfig.findMany({ orderBy: { key: 'asc' } });
}

function coerceHotline(row: SystemConfig, fallback: Hotline): Hotline {
  const value = row.value as Prisma.JsonValue;
  const object = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    key: row.key,
    label: row.label,
    number: String(object.number ?? fallback.number),
    description: (object.description as string | undefined) ?? fallback.description,
    available24h: (object.available24h as boolean | undefined) ?? fallback.available24h,
  };
}

export async function getHotlines(): Promise<Hotline[]> {
  const rows = await readAll();
  const byKey = new Map(rows.map((row) => [row.key, row]));

  return HOTLINE_DEFAULTS.map((fallback) => {
    const row = byKey.get(fallback.key);
    return row ? coerceHotline(row, fallback) : fallback;
  });
}

export async function getHotline(key: string): Promise<Hotline | null> {
  const hotlines = await getHotlines();
  return hotlines.find((line) => line.key === key) ?? null;
}

export async function getString(key: string, fallback: string): Promise<string> {
  const row = await prisma.systemConfig.findUnique({ where: { key } });
  if (!row) return fallback;
  const value = row.value as Prisma.JsonValue;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return String((value as Record<string, unknown>).text);
  }
  return fallback;
}

export async function setConfig(
  key: string,
  label: string,
  value: unknown,
  options: { group?: string; description?: string; updatedById?: string } = {},
): Promise<SystemConfig> {
  return prisma.systemConfig.upsert({
    where: { key },
    create: {
      key,
      label,
      group: options.group ?? 'general',
      description: options.description,
      value: (value ?? null) as Prisma.InputJsonValue,
      updatedById: options.updatedById,
    },
    update: {
      label,
      group: options.group ?? 'general',
      description: options.description,
      value: (value ?? null) as Prisma.InputJsonValue,
      updatedById: options.updatedById,
    },
  });
}

/** Public, read-only view used by the client (never exposes internal keys). */
export async function getPublicConfig(): Promise<Record<string, unknown>> {
  const [hotlines, sosMessage] = await Promise.all([
    getHotlines(),
    getString('sos.message', SOS_MESSAGE_DEFAULT),
  ]);

  return {
    hotlines,
    sosMessage,
    supportEmail: await getString('contact.email', 'safety@guardiantransit.app'),
    emergencyNotice:
      'SOS alerts are logged and sent to the safety desk together with your live location.',
  };
}
