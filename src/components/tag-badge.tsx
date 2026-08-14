import { TAG_LABELS } from "@/lib/constants";
import type { Tag } from "@/lib/domain";

export function TagBadge({ tag, large = false }: { tag: Tag; large?: boolean }) {
  return <span className={`tag-badge tag-${tag}${large ? " tag-large" : ""}`}><i />{TAG_LABELS[tag]}</span>;
}
