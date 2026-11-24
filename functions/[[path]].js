/** Cloudflare Pages Functions adapter for the existing MCP Worker.
 * Deployed automatically with the Git-integrated Pages project: no second Worker.
 * All personal data remains behind Supabase owner JWT + RLS; no service-role secret.
 */
import worker from '../worker/mcp.mjs';
import {fictionDraft} from '../worker/fiction-draft.mjs';
import {PUBLIC_SUPABASE_CONFIG,PUBLIC_OAUTH_CLIENT_ID} from '../public/lib/public-config.mjs';

export const MCP_BASE='https://living-world-next.pages.dev/mcp';
const ALLOWED=new Set(['/mcp','/health','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp']);

export function onRequest(context){
  const url=new URL(context.request.url);
  if(url.pathname==='/api/fiction-draft')return fictionDraft(context.request,{SUPABASE_URL:PUBLIC_SUPABASE_CONFIG.url,SUPABASE_ANON_KEY:PUBLIC_SUPABASE_CONFIG.key});
  if(!ALLOWED.has(url.pathname))return context.next();
  // Only public project data is embedded. OAuth client ID is configured in Pages settings,
  // not guessed or copied from the legacy LIVING WORLD integration.
  const env={
    SUPABASE_URL:PUBLIC_SUPABASE_CONFIG.url,
    SUPABASE_ANON_KEY:PUBLIC_SUPABASE_CONFIG.key,
    MCP_PUBLIC_URL:MCP_BASE,
    SUPABASE_OAUTH_CLIENT_ID:String(context.env?.SUPABASE_OAUTH_CLIENT_ID||PUBLIC_OAUTH_CLIENT_ID||'')
  };
  return worker.fetch(context.request,env);
}
