import config from '../../config/env';

export interface SmsResult {
  provider: string;
  messageId?: string;
  accepted: boolean;
}

export interface SmsProvider {
  name: string;
  send(to: string, body: string): Promise<SmsResult>;
}

/** Always available: writes the message to the server log (development/testing). */
const logProvider: SmsProvider = {
  name: 'log',
  async send(to, body) {
    console.log(`[sms:log] -> ${to}\n${body}`);
    return { provider: 'log', accepted: true };
  },
};

/**
 * Development provider: behaves like a real gateway but records the message in
 * memory so the API can expose the latest code in non-production environments.
 * Never returns message bodies to clients when NODE_ENV=production.
 */
const devStore: Array<{ to: string; body: string; at: number }> = [];

const devProvider: SmsProvider = {
  name: 'dev',
  async send(to, body) {
    devStore.push({ to, body, at: Date.now() });
    if (devStore.length > 200) devStore.splice(0, devStore.length - 200);
    console.log(`[sms:dev] -> ${to}\n${body}`);
    return { provider: 'dev', messageId: `dev_${Date.now()}`, accepted: true };
  },
};

export function recentDevMessages(phone?: string): Array<{ to: string; body: string; at: number }> {
  if (config.isProd) return [];
  const list = phone ? devStore.filter((m) => m.to.includes(phone)) : devStore;
  return list.slice(-10).reverse();
}

/**
 * Twilio-compatible gateway. Credentials come from SMS_PROVIDER_KEY (Account SID)
 * and SMS_PROVIDER_SECRET (Auth Token); both are server-side only.
 */
const twilioProvider: SmsProvider = {
  name: 'twilio',
  async send(to, body) {
    const sid = config.sms.key;
    const token = config.sms.secret;
    if (!sid || !token) {
      throw new Error('SMS provider credentials are not configured.');
    }
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const params = new URLSearchParams({ To: to, From: config.sms.from, Body: body });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SMS gateway rejected the message (${response.status}): ${text.slice(0, 200)}`);
    }

    const json = (await response.json()) as { sid?: string };
    return { provider: 'twilio', messageId: json.sid, accepted: true };
  },
};

/** Generic HTTP gateway driven by SMS_PROVIDER_KEY / SMS_PROVIDER_SECRET. */
const customProvider: SmsProvider = {
  name: 'custom',
  async send(to, body) {
    const endpoint = config.sms.key;
    if (!endpoint.startsWith('http')) {
      throw new Error('Custom SMS provider requires SMS_PROVIDER_KEY to be a webhook URL.');
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.sms.secret ? { Authorization: `Bearer ${config.sms.secret}` } : {}),
      },
      body: JSON.stringify({ to, from: config.sms.from, body, text: body }),
    });
    if (!response.ok) {
      throw new Error(`SMS gateway returned ${response.status}.`);
    }
    return { provider: 'custom', accepted: true };
  },
};

const providers: Record<string, SmsProvider> = {
  dev: devProvider,
  log: logProvider,
  console: logProvider,
  twilio: twilioProvider,
  custom: customProvider,
};

export function getSmsProvider(): SmsProvider {
  return providers[config.sms.provider] ?? logProvider;
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  return getSmsProvider().send(to, body);
}
