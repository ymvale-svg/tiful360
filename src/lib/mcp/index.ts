import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listEmployees from "./tools/list-employees";
import getEmployee from "./tools/get-employee";
import listAssets from "./tools/list-assets";
import listLeaveRequests from "./tools/list-leave-requests";
import listItTickets from "./tools/list-it-tickets";
import createItTicket from "./tools/create-it-ticket";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "360",
  title: "תפעול 360",
  version: "0.1.0",
  instructions:
    "כלים למערכת תפעול 360 (ניהול עובדים, משאבים, חופשות וקריאות שירות). כל הכלים פועלים בהרשאות המשתמש המחובר.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listEmployees, getEmployee, listAssets, listLeaveRequests, listItTickets, createItTicket],
});
