// Wiring for the folder-scan intake (logic and tests: handler.ts). Secrets: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. The scan key itself is per system, created in the הרשאות מערכות screen.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handle } from "./handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve((req) =>
  handle(req, {
    cors: corsHeaders,
    ingest: async ({ systemId, token, paths, agent }) => {
      const { data, error } = await service.rpc("ingest_system_access_tree", {
        _system_id: systemId, _token: token, _paths: paths, _agent: agent,
      });
      if (error) throw new Error(error.message);
      return data;
    },
  }),
);
