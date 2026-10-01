import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AvailableDriver, Quote, SavedLocation } from '../lib/types';

export interface BookingPlace extends SavedLocation {}

interface BookingState {
  studentId: string | null;
  pickup: BookingPlace | null;
  destination: BookingPlace | null;
  quote: Quote | null;
  driver: AvailableDriver | null;
  useFreeRide: boolean;
  pickupPin: string | null;
}

interface BookingContextValue extends BookingState {
  setStudent: (id: string | null) => void;
  setPickup: (place: BookingPlace | null) => void;
  setDestination: (place: BookingPlace | null) => void;
  setQuote: (quote: Quote | null) => void;
  setDriver: (driver: AvailableDriver | null) => void;
  setUseFreeRide: (value: boolean) => void;
  setPickupPin: (pin: string | null) => void;
  reset: () => void;
}

const empty: BookingState = {
  studentId: null,
  pickup: null,
  destination: null,
  quote: null,
  driver: null,
  useFreeRide: false,
  pickupPin: null,
};

const BookingContext = createContext<BookingContextValue | null>(null);

/**
 * Carries the in-progress booking between the flow's screens.
 * Every setter keeps a stable identity (functional updates, no extra deps) so
 * `useEffect(..., [setQuote])` style consumers cannot loop.
 */
export function BookingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BookingState>(empty);

  const patch = useCallback((next: Partial<BookingState> | ((prev: BookingState) => Partial<BookingState>)) => {
    setState((prev) => ({ ...prev, ...(typeof next === 'function' ? next(prev) : next) }));
  }, []);

  const setStudent = useCallback((studentId: string | null) => patch({ studentId }), [patch]);
  const setPickup = useCallback(
    (pickup: BookingPlace | null) => patch((prev) => ({ pickup, quote: prev.quote && pickup === prev.pickup ? prev.quote : null })),
    [patch],
  );
  const setDestination = useCallback(
    (destination: BookingPlace | null) =>
      patch((prev) => ({
        destination,
        quote: prev.quote && destination === prev.destination ? prev.quote : null,
      })),
    [patch],
  );
  const setQuote = useCallback((quote: Quote | null) => patch({ quote }), [patch]);
  const setDriver = useCallback((driver: AvailableDriver | null) => patch({ driver }), [patch]);
  const setUseFreeRide = useCallback((useFreeRide: boolean) => patch({ useFreeRide }), [patch]);
  const setPickupPin = useCallback((pickupPin: string | null) => patch({ pickupPin }), [patch]);
  const reset = useCallback(() => setState(empty), []);

  const value = useMemo<BookingContextValue>(
    () => ({
      ...state,
      setStudent,
      setPickup,
      setDestination,
      setQuote,
      setDriver,
      setUseFreeRide,
      setPickupPin,
      reset,
    }),
    [
      state,
      setStudent,
      setPickup,
      setDestination,
      setQuote,
      setDriver,
      setUseFreeRide,
      setPickupPin,
      reset,
    ],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking(): BookingContextValue {
  const context = useContext(BookingContext);
  if (!context) throw new Error('useBooking must be used inside <BookingProvider>');
  return context;
}
