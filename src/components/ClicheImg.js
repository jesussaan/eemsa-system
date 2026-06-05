import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function ClicheImg({ src, style }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!src) return;
    if (src.startsWith('http')) { setUrl(src); return; }
    const { data } = supabase.storage.from("cliches").getPublicUrl(src);
    if (data?.publicUrl) setUrl(data.publicUrl);
  }, [src]);
  const onError = () => {
    if (!src || src.startsWith('http')) return;
    supabase.storage.from("cliches").createSignedUrl(src, 24 * 3600)
      .then(({ data }) => { if (data?.signedUrl) setUrl(data.signedUrl); });
  };
  if (!url) return null;
  return <img src={url} alt="cliché" style={style} onError={onError} />;
}
