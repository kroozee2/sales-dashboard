"use client";

import { useEffect, useState, useCallback } from "react";

// Shared "who am I looking at" selector for the Tasks tab group (Tasks, Winning
// Formula, KPIs). Persisted in localStorage so it survives navigation between
// those separate pages, and synced live across mounted components via an event.
export type Person = "all" | "Andrew" | "Jameson";

const KEY = "salesos.person";
const EVT = "salesos-person-change";

export function getPerson(): Person {
  if (typeof window === "undefined") return "all";
  const v = localStorage.getItem(KEY);
  return v === "Andrew" || v === "Jameson" ? v : "all";
}

export function usePerson(): [Person, (p: Person) => void] {
  const [person, setPersonState] = useState<Person>("all");

  useEffect(() => {
    setPersonState(getPerson());
    const sync = () => setPersonState(getPerson());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); };
  }, []);

  const setPerson = useCallback((p: Person) => {
    if (typeof window !== "undefined") localStorage.setItem(KEY, p);
    setPersonState(p);
    window.dispatchEvent(new Event(EVT));
  }, []);

  return [person, setPerson];
}
