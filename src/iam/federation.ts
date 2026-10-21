// OIDC federation helpers (Part 07 REQ-IAM-F02): PKCE (RFC 7636) and the ID-token claim rules. The token exchange and the
// signature check against the provider's keys need the identity provider to be named (CF-013): they are not built here,
// and nothing in this file accepts an ID token on its own.
import { createHash, randomBytes } from "node:crypto";

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function pkceChallengeOf(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export interface IdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nonce?: unknown;
}

/** Checks the claims of an ID token: issuer, audience, expiry and the nonce this sign-in started with. */
export function idTokenProblems(claims: IdTokenClaims, expected: { issuer: string; clientId: string; nonce: string; nowSeconds: number }): string[] {
  const problems: string[] = [];
  if (claims.iss !== expected.issuer) problems.push("the token was not issued by the expected provider");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(expected.clientId)) problems.push("the token is not meant for this application");
  if (typeof claims.exp !== "number" || claims.exp <= expected.nowSeconds) problems.push("the token has expired");
  if (claims.nonce !== expected.nonce) problems.push("the token does not match this sign-in (nonce)");
  return problems;
}

/** Builds the authorisation URL for the code flow with PKCE (S256). */
export function authorizeUrl(config: { authorizationEndpoint: string; clientId: string; redirectUri: string }, state: { state: string; nonce: string; challenge: string }): string {
  const url = new URL(config.authorizationEndpoint);
  // Set each parameter, keeping any the endpoint already carries (assigning `search` would drop them).
  const params: Record<string, string> = {
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "openid profile email",
    state: state.state,
    nonce: state.nonce,
    code_challenge: state.challenge,
    code_challenge_method: "S256",
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}
