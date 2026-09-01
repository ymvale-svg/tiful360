/**
 * Lazy façade over the PDF builders.
 *
 * pdf-lib plus the embedded Hebrew fonts are a few hundred KB, and they were
 * landing in the entry chunk because these builders are imported by components
 * that eagerly-loaded pages pull in. Nobody needs them until they actually
 * generate or preview a protocol.
 *
 * Every export keeps the signature of the real builder, so a call site only
 * swaps its import path — `@/lib/pdf/buildProtocolPdf` becomes `@/lib/pdf/lazy`
 * — and nothing else changes. `typeof import(...)` in a type position is
 * erased at compile time and creates no runtime dependency.
 */

type Args<T extends (...args: never[]) => unknown> = Parameters<T>;

type BuildProtocolPdf = typeof import("./buildProtocolPdf")["buildProtocolPdf"];
type BuildHandoverPdf = typeof import("./buildHandoverPdf")["buildHandoverPdf"];
type BuildOffboardingPdf = typeof import("./buildOffboardingPdf")["buildOffboardingPdf"];
type BuildOffboardingProtocolPdf =
  typeof import("./buildOffboardingProtocolPdf")["buildOffboardingProtocolPdf"];
type BuildProtocolPreviewPdf =
  typeof import("./buildProtocolPreviewPdf")["buildProtocolPreviewPdf"];

export async function buildProtocolPdf(...args: Args<BuildProtocolPdf>) {
  return (await import("./buildProtocolPdf")).buildProtocolPdf(...args);
}

export async function buildHandoverPdf(...args: Args<BuildHandoverPdf>) {
  return (await import("./buildHandoverPdf")).buildHandoverPdf(...args);
}

export async function buildOffboardingPdf(...args: Args<BuildOffboardingPdf>) {
  return (await import("./buildOffboardingPdf")).buildOffboardingPdf(...args);
}

export async function buildOffboardingProtocolPdf(...args: Args<BuildOffboardingProtocolPdf>) {
  return (await import("./buildOffboardingProtocolPdf")).buildOffboardingProtocolPdf(...args);
}

export async function buildProtocolPreviewPdf(...args: Args<BuildProtocolPreviewPdf>) {
  return (await import("./buildProtocolPreviewPdf")).buildProtocolPreviewPdf(...args);
}
