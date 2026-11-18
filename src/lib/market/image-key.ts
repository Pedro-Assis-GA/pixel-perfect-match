// Cosmetic variants share artwork, but different paint finishes never do.
export function imageKey(name: string) {
  return name
    .replace(/^(StatTrak™ |Souvenir )/, "")
    .replace(/ \((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/, "");
}

export function imageBucket(name: string) {
  let hash = 0;
  for (const character of imageKey(name))
    hash = (Math.imul(hash, 31) + character.codePointAt(0)!) >>> 0;
  return (hash % 256).toString(16).padStart(2, "0");
}
