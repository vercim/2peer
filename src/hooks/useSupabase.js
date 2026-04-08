import { useState, useCallback, useRef } from "react";

export function useSupabase({ onSignal, onStatusChange }) {
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [myChannel, setMyChannel] = useState(null);
  const outChannelRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const connect = useCallback(
    async (url, key, selfId) => {
      console.log("[Supabase] connecting to:", url);
      console.log("[Supabase] supabase lib available:", typeof window.supabase);

      if (!window.supabase) {
        if (onStatusChange)
          onStatusChange("Error: Supabase library not loaded.", true);
        return;
      }

      let client = supabaseClient;
      if (!client) {
        try {
          client = window.supabase.createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          setSupabaseClient(client);
        } catch (e) {
          console.log("[Supabase] createClient error:", e);
          if (onStatusChange)
            onStatusChange("Supabase initialization error: " + e.message, true);
          return;
        }
      }

      if (myChannel) {
        try {
          await client.removeChannel(myChannel);
        } catch (_) {}
        setMyChannel(null);
        await new Promise((r) => setTimeout(r, 200));
      }

      const channel = client.channel(`peer:${selfId}`, {
        config: { broadcast: { self: false } },
      });

      channel
        .on("broadcast", { event: "signal" }, ({ payload }) => {
          handleSignal(payload).catch((e) =>
            onStatusChange(e.message || "Signaling error.", true),
          );
        })
        .subscribe((status) => {
          console.log("[Supabase] status:", status);
          if (status === "SUBSCRIBED") {
            if (reconnectTimerRef.current) {
              clearTimeout(reconnectTimerRef.current);
              reconnectTimerRef.current = null;
            }
            if (onStatusChange)
              onStatusChange('Ready. Share your ID and click "Call".');
          }
          if (status === "CHANNEL_ERROR") {
            console.log("[Supabase] CHANNEL_ERROR - checking connection...");
            if (onStatusChange)
              onStatusChange("Channel error. Attempting to reconnect...");
          }
          if (status === "TIMED_OUT") {
            if (onStatusChange)
              onStatusChange("Connection timeout. Retrying...");
          }
          if (status === "CLOSED") {
            console.log("[Supabase] connection closed");
            if (onStatusChange) onStatusChange("Connection closed.");
          }
        });

      setMyChannel(channel);
      return client;
    },
    [supabaseClient, myChannel, onSignal, onStatusChange],
  );

  const handleSignal = useCallback(
    async (payload) => {
      console.log("[signal received]", payload.type, "from", payload.from);
      if (onSignal) onSignal(payload);
    },
    [onSignal],
  );

  const send = useCallback(
    async (payload) => {
      if (!supabaseClient) {
        if (onStatusChange) onStatusChange("No connection to Supabase.", true);
        return;
      }
      try {
        await ensureOutChannel(payload.to);
        await outChannelRef.current.send({
          type: "broadcast",
          event: "signal",
          payload: { ...payload, from: window.__SELF_ID__ },
        });
        console.log("[send] done");
      } catch (e) {
        console.error("[send error]", e.message);
        if (onStatusChange) onStatusChange("Send error: " + e.message, true);
      }
    },
    [supabaseClient, onStatusChange],
  );

  const ensureOutChannel = useCallback(
    async (peerId) => {
      if (
        outChannelRef.current &&
        outChannelRef.current._topic === `realtime:peer:${peerId}`
      )
        return;

      if (outChannelRef.current) {
        try {
          await supabaseClient.removeChannel(outChannelRef.current);
        } catch (_) {}
        outChannelRef.current = null;
      }

      const ch = supabaseClient.channel(`peer:${peerId}`, {
        config: { broadcast: { self: false } },
      });

      console.log("[ensureOutChannel] subscribing to peer:", peerId);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (outChannelRef.current) {
            console.log(
              "[ensureOutChannel] timeout but channel exists, using it",
            );
            resolve();
          } else {
            reject(new Error("Failed to connect to peer (timeout)"));
          }
        }, 8000);
        ch.subscribe((status) => {
          console.log("[ensureOutChannel] subscribe status:", status);
          clearTimeout(timer);
          if (status === "SUBSCRIBED") {
            outChannelRef.current = ch;
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            reject(new Error("Failed to connect to peer (" + status + ")"));
          } else {
            outChannelRef.current = ch;
            resolve();
          }
        });
      });
    },
    [supabaseClient],
  );

  const disconnect = useCallback(async () => {
    if (outChannelRef.current) {
      await supabaseClient
        ?.removeChannel(outChannelRef.current)
        .catch(() => {});
      outChannelRef.current = null;
    }
    if (myChannel) {
      await supabaseClient?.removeChannel(myChannel).catch(() => {});
    }
  }, [supabaseClient, myChannel]);

  return {
    supabaseClient,
    myChannel,
    connect,
    send,
    disconnect,
  };
}
