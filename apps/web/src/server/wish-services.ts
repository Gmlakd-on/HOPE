import { type ListApprovedWishes, SubmitWish } from "@hope/wishes-domain";
import {
  HmacSha256Hasher,
  SupabaseWishRepository,
  TurnstileVerifier,
} from "@hope/wishes-infrastructure";
import {
  resolveWishRuntimeConfig,
  type WishRuntimeEnvironment,
} from "./runtime-config";

const DEFAULT_FEED_LIMIT = 24;

function createWishFeedReaders(repository: SupabaseWishRepository) {
  let requestedLimit = DEFAULT_FEED_LIMIT;
  let snapshot: Promise<
    Awaited<ReturnType<SupabaseWishRepository["listApprovedFeed"]>>
  > | null = null;

  const load = (limit: number) => {
    if (!snapshot || requestedLimit !== limit) {
      requestedLimit = limit;
      snapshot = repository.listApprovedFeed(limit);
    }
    return snapshot;
  };

  return {
    list: {
      async execute(limit = DEFAULT_FEED_LIMIT) {
        return (await load(limit)).items;
      },
    } satisfies Pick<ListApprovedWishes, "execute">,
    count: {
      async execute(): Promise<number> {
        return (await load(requestedLimit)).total;
      },
    },
  };
}

export function createWishServices(environment: WishRuntimeEnvironment) {
  const config = resolveWishRuntimeConfig(environment);
  const repository = SupabaseWishRepository.fromEnvironment(
    config.supabaseUrl,
    config.supabaseSecretKey,
  );
  const verifier = new TurnstileVerifier(config.turnstile);
  const hasher = new HmacSha256Hasher(config.hashSecret);
  const feed = createWishFeedReaders(repository);

  return {
    ...feed,
    submit: new SubmitWish(repository, verifier, hasher, config.rateLimit),
  };
}
