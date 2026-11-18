import { useEffect, useState } from "react";
import { Crosshair } from "lucide-react";
import { imageBucket, imageKey } from "@/lib/market/image-key";

const buckets = new Map<string, Promise<Record<string, string>>>();
function lookup(name: string) {
  const bucket = imageBucket(name);
  let request = buckets.get(bucket);
  if (!request) {
    request = fetch(`/images/catalog/${bucket}.json`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Image catalog unavailable");
        return response.json() as Promise<Record<string, string>>;
      })
      .catch(() => {
        buckets.delete(bucket);
        return {};
      });
    buckets.set(bucket, request);
  }
  return request.then((items) => items[imageKey(name)] ?? null);
}

export function SkinImage({
  name,
  src,
  className = "",
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  const [found, setFound] = useState<{ name: string; url: string | null } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (src) return;
    let active = true;
    lookup(name).then((url) => {
      if (active) setFound({ name, url });
    });
    return () => {
      active = false;
    };
  }, [name, src]);
  const url = src || (found?.name === name ? found.url : null);
  return (
    <div className={`skin-image ${className}`}>
      {url && failed !== url ? (
        <img src={url} alt={name} loading="lazy" decoding="async" onError={() => setFailed(url)} />
      ) : (
        <div className="image-fallback" role="img" aria-label={`Imagem indisponível: ${name}`}>
          <Crosshair aria-hidden="true" />
          <span>Imagem indisponível</span>
        </div>
      )}
    </div>
  );
}
