import { supabase } from "@/integrations/supabase/client";

/**
 * For unauthenticated signing flows: requests a short-lived signed upload URL
 * from the edge function (which validates the sign_token), then uploads the file.
 * Returns the public URL of the uploaded object.
 */
export async function uploadViaSignedToken(params: {
  sign_token: string;
  form_type: "handover" | "offboarding";
  kind: "attachment" | "pdf";
  file: Blob | File;
  filename?: string;
  contentType?: string;
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke("sign-form-upload-url", {
    body: {
      sign_token: params.sign_token,
      form_type: params.form_type,
      kind: params.kind,
      filename: params.filename ?? (params.file instanceof File ? params.file.name : undefined),
      content_type: params.contentType,
    },
  });
  if (error) throw error;
  if (!data?.signed_url || !data?.path || !data?.token) {
    throw new Error("Invalid sign URL response");
  }

  const { error: upErr } = await supabase.storage
    .from("handover-forms")
    .uploadToSignedUrl(data.path, data.token, params.file, {
      contentType: params.contentType ?? (params.file instanceof File ? params.file.type : "application/octet-stream"),
      upsert: true,
    });
  if (upErr) throw upErr;
  return data.public_url as string;
}
