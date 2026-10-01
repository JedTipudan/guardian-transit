import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { MetaPayload } from '../lib/types';

const MetaContext = createContext<MetaPayload | null>(null);

/** Public runtime configuration (map provider, OTP policy, emergency hotlines). */
export function MetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<MetaPayload | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<MetaPayload>('/meta')
      .then((payload) => {
        if (active) setMeta(payload);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return <MetaContext.Provider value={meta}>{children}</MetaContext.Provider>;
}

export function useMeta(): MetaPayload | null {
  return useContext(MetaContext);
}
