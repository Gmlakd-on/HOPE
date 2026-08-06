import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

async function psql(sql: string): Promise<string> {
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is not configured.");
  const { stdout } = await execFileAsync(
    "psql",
    [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { maxBuffer: 1024 * 1024 },
  );
  return stdout.trim();
}

describeDatabase("PostgreSQL atomic wish submission", () => {
  beforeEach(async () => {
    await psql("truncate table public.wishes;");
  });

  afterAll(async () => {
    if (databaseUrl) await psql("truncate table public.wishes;");
  });

  it("stores no more than the configured limit during parallel requests", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        psql(`
        select public.submit_wish_atomic(
          'parallel wish ${index}',
          'private'::public.wish_visibility,
          'ko'::public.wish_locale,
          'same-submitter-hash',
          2,
          60
        );
      `),
      ),
    );

    const accepted = attempts
      .map((result) => JSON.parse(result) as { accepted: boolean })
      .filter((result) => result.accepted);
    expect(accepted).toHaveLength(2);
    await expect(psql("select count(*) from public.wishes;")).resolves.toBe(
      "2",
    );
  });

  it("rejects a missing submitter hash instead of bypassing the limit", async () => {
    await expect(
      psql(`
        select public.submit_wish_atomic(
          'missing hash',
          'private'::public.wish_visibility,
          'ko'::public.wish_locale,
          null,
          2,
          60
        );
      `),
    ).rejects.toThrow(/p_submitter_hash is required/);
    await expect(psql("select count(*) from public.wishes;")).resolves.toBe(
      "0",
    );
  });

  it("deploys RLS and denies direct browser/service inserts", async () => {
    await expect(
      psql(`
      select relrowsecurity
        from pg_catalog.pg_class
       where oid = 'public.wishes'::regclass;
    `),
    ).resolves.toBe("t");

    await expect(
      psql("select has_table_privilege('anon', 'public.wishes', 'select');"),
    ).resolves.toBe("f");
    await expect(
      psql(
        "select has_table_privilege('authenticated', 'public.wishes', 'select');",
      ),
    ).resolves.toBe("f");
    await expect(
      psql(
        "select has_table_privilege('service_role', 'public.wishes', 'insert');",
      ),
    ).resolves.toBe("f");
    await expect(
      psql(`
      select has_function_privilege(
        'service_role',
        'public.submit_wish_atomic(text,public.wish_visibility,public.wish_locale,text,integer,integer)',
        'execute'
      );
    `),
    ).resolves.toBe("t");
  });
});
