import { useCallback } from "react";

export function useStatusLog(statusLog, setStatusLog) {
  const addStatus = useCallback(
    (msg, isError = false) => {
      const id = Date.now() + Math.random();
      setStatusLog((prev) => [...prev.slice(-49), { id, text: msg, isError }]);
    },
    [setStatusLog],
  );

  return { addStatus, statusLog };
}
