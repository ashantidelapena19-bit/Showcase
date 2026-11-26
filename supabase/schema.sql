-- Software Engineering Class A Portfolio Gallery
-- Unified User Profiles, Published Portfolios & Media Storage Schema
-- Safe to run on a fresh database OR re-run to upgrade an existing setup.

create extension if not exists pgcrypto;

-- 1. Unified profile + publishable portfolio table keyed by normalized lowercase email
create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  auth_user_id uuid references auth.users(id) on delete set null,
  username text,
  display_name text not null default '',
  avatar_url text,
  bio text not null default '',
  roll_number text,
  role_title text not null default 'Software Engineering Student',
  discipline text not null default 'Full-Stack',
  project_title text not null default '',
  project_summary text not null default '',
  cover_image_url text,
  portfolio_url text,
  skills text[] not null default '{}',
  highlights text[] not null default '{}',
  social_links jsonb not null default '{}'::jsonb,
  onboarding_completed boolean not null default false,
  is_published boolean not null default false,
  published_at timestamptz,
  auth_providers text[] not null default '{}',
  last_sign_in_provider text,
  last_sign_in_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_email_lowercase check (email = lower(trim(email)))
);

-- Upgrade columns cleanly if user_profiles already existed from initial setup
alter table public.user_profiles add column if not exists username text;
alter table public.user_profiles add column if not exists bio text not null default '';
alter table public.user_profiles add column if not exists role_title text not null default 'Software Engineering Student';
alter table public.user_profiles add column if not exists discipline text not null default 'Full-Stack';
alter table public.user_profiles add column if not exists project_title text not null default '';
alter table public.user_profiles add column if not exists project_summary text not null default '';
alter table public.user_profiles add column if not exists cover_image_url text;
alter table public.user_profiles add column if not exists skills text[] not null default '{}';
alter table public.user_profiles add column if not exists highlights text[] not null default '{}';
alter table public.user_profiles add column if not exists social_links jsonb not null default '{}'::jsonb;
alter table public.user_profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.user_profiles add column if not exists is_published boolean not null default false;
alter table public.user_profiles add column if not exists published_at timestamptz;

-- Backfill existing configured profiles so users who already set up a username and stack are marked complete
update public.user_profiles
set onboarding_completed = true
where onboarding_completed = false
  and username is not null
  and length(trim(username)) > 0
  and coalesce(array_length(skills, 1), 0) > 0;

create index if not exists user_profiles_auth_user_id_idx
  on public.user_profiles (auth_user_id);

create unique index if not exists user_profiles_username_unique_idx
  on public.user_profiles (lower(username))
  where username is not null and length(trim(username)) > 0;

create index if not exists user_profiles_published_idx
  on public.user_profiles (is_published, published_at desc);

-- 2. Enable Row Level Security & set least-privilege table grants
alter table public.user_profiles enable row level security;
grant usage on schema public to anon, authenticated;
revoke all on table public.user_profiles from anon, authenticated;
grant select on table public.user_profiles to anon;
grant select, insert, update on table public.user_profiles to authenticated;

-- 3. RLS Policies
-- Owner can view their own profile (published or draft)
drop policy if exists "Users can view own profile by uid or email" on public.user_profiles;
create policy "Users can view own profile by uid or email"
  on public.user_profiles
  for select
  to authenticated
  using (
    auth_user_id = (select auth.uid())
    or email = lower(trim(coalesce((select auth.jwt() ->> 'email'), '')))
  );

-- Visitors cannot directly query user_profiles rows (protects email & auth metadata).
-- Public gallery reads go through security-definer RPCs below that omit PII.
drop policy if exists "Anyone can view published portfolios" on public.user_profiles;

drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile"
  on public.user_profiles
  for insert
  to authenticated
  with check (
    auth_user_id = (select auth.uid())
    and email = lower(trim(coalesce((select auth.jwt() ->> 'email'), '')))
  );

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
  on public.user_profiles
  for update
  to authenticated
  using (
    auth_user_id = (select auth.uid())
    or email = lower(trim(coalesce((select auth.jwt() ->> 'email'), '')))
  )
  with check (
    email = lower(trim(coalesce((select auth.jwt() ->> 'email'), '')))
  );

-- 4. Private schema helpers: legitimate email guard & auth.users -> public.user_profiles sync
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.is_disposable_or_fake_email(p_email text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text;
  local_part text;
  base_local text;
  compact_local text;
  gmail_canonical text;
  domain_part text;
  tld_part text;
  blocked_domains text[] := array[
    'example.com', 'example.org', 'example.net', 'example.edu',
    'test.com', 'test.org', 'test.net', 'test.edu', 'testing.com',
    'fake.com', 'fake.org', 'fake.net', 'fakemail.com', 'fakemail.net',
    'fakemail.org', 'fakemail.fr', 'fakemail.io', 'fakeemail.com', 'fakeinbox.com',
    'fakemailgenerator.com', 'dummy.com', 'dummyemail.com', 'none.com', 'null.com',
    'noemail.com', 'nomail.com', 'asdf.com', 'qwerty.com', 'abc.com', 'xyz.com',
    '123.com', 'a.com', 'aa.com', 'aaa.com', 'domain.com', 'email.com',
    'sample.com', 'demo.com', 'se-class-a.edu',
    '10mail.org', '10mail.tk', '10minmail.com', '10minutemail.co.uk',
    '10minutemail.com', '10minutemail.de', '10minutemail.net', '10minutemail.org',
    '1secmail.com', '1secmail.net', '1secmail.org',
    '20email.eu', '20minutemail.com', '30minutemail.com', '60minutemail.com',
    'anonbox.net', 'anonymbox.com', 'armyspy.com', 'binkmail.com', 'bobmail.info',
    'bouncr.com', 'bugmenot.com', 'burner.kiwi', 'burnermail.io', 'byom.de',
    'cachedot.net', 'chammy.info', 'cheatmail.de', 'clrmail.com', 'cool.fr.nf',
    'courriel.fr.nf', 'crazymailing.com', 'cuvox.de', 'dandikmail.com', 'dayrep.com',
    'dcctb.com', 'deadaddress.com', 'despam.it', 'devnullmail.com', 'discard.email',
    'discardmail.com', 'discardmail.de', 'disposeamail.com', 'dispostable.com',
    'dodgit.com', 'dontreg.com', 'dpptd.com', 'dropmail.me', 'e4ward.com', 'einrot.com',
    'email60.com', 'emailfake.com', 'emailias.com', 'emailinfive.com', 'emailondeck.com',
    'emailsensei.com', 'emailtemporanea.com', 'emailtemporario.com.br', 'emailthe.net',
    'emailwarden.com', 'emkei.cz', 'esiix.com', 'eyepaste.com', 'ezztt.com',
    'fastacura.com', 'filzmail.com', 'fixmail.tk', 'fleckens.hu', 'flyspam.com',
    'fr33mail.info', 'garbagemail.org', 'generator.email', 'getairmail.com',
    'getnada.com', 'getonemail.com', 'ghosttexter.de', 'gishpuppy.com', 'grr.la',
    'guerrillamail.biz', 'guerrillamail.com', 'guerrillamail.de', 'guerrillamail.info',
    'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'gustr.com',
    'haltospam.com', 'harakirimail.com', 'hidemail.de', 'hotpop.com', 'icznn.com',
    'ieh-mail.de', 'illubd.com', 'imails.info', 'inboxalias.com', 'inboxbear.com',
    'inboxclean.com', 'inboxkitten.com', 'incognitomail.com', 'incognitomail.net',
    'incognitomail.org', 'insorg-mail.info', 'instant-mail.de', 'ipoo.org',
    'jetable.com', 'jetable.fr.nf', 'jetable.net', 'jetable.org', 'jnxjn.com',
    'jourrapide.com', 'junk1e.com', 'karenkey.com', 'kasmail.com', 'keepmymail.com',
    'killmail.com', 'killmail.net', 'klzlk.com', 'koszmail.pl', 'kurzepost.de',
    'kzccv.com', 'laafd.com', 'letthemeatspam.com', 'lhsdv.com', 'lifebyfood.com',
    'link2mail.net', 'litedrop.com', 'lookugly.com', 'lortemail.dk', 'lr78.com',
    'mail-temporaire.fr', 'mail.by', 'mail.gw', 'mail.tm', 'mail4trash.com',
    'mailbidon.com', 'mailblocks.com', 'mailbucket.org', 'mailcatch.com', 'maildrop.cc',
    'maileater.com', 'maileimer.de', 'mailexpire.com', 'mailfa.tk', 'mailforspam.com',
    'mailfreeonline.com', 'mailin8r.com', 'mailinater.com', 'mailinator.com',
    'mailinator.gq', 'mailinator.net', 'mailinator.org', 'mailinator2.com',
    'mailincubator.com', 'mailismagic.com', 'mailmate.com', 'mailmetrash.com',
    'mailmoat.com', 'mailnator.com', 'mailnesia.com', 'mailnull.com', 'mailscrap.com',
    'mailshell.com', 'mailsiphon.com', 'mailslite.com', 'mailtemp.info',
    'mailtothis.com', 'mailzilla.com', 'mbx.cc', 'meltmail.com', 'messagebeamer.de',
    'minex-email.com', 'mintemail.com', 'minutemailbox.com', 'mjukg.com', 'moakt.cc',
    'moakt.com', 'moakt.ws', 'mohmal.com', 'mohmal.im', 'mohmal.in', 'mohmal.tech',
    'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf', 'monumentmail.com',
    'mvrht.net', 'my10minutemail.com', 'mymailoasis.com', 'myphantomemail.com',
    'mytemp.email', 'mytempmail.com', 'mytrashmail.com', 'nada.email', 'nada.ltd',
    'neomailbox.com', 'nepwk.com', 'nervmich.net', 'nervtmich.net', 'netmails.com',
    'netmails.net', 'neverbox.com', 'no-spam.ws', 'nobulk.com', 'noclickemail.com',
    'nomail.pw', 'nomail2me.com', 'nomorespamemails.com', 'nospam4.us', 'nospamfor.us',
    'notmailinator.com', 'nowmymail.com', 'nurfuerspam.de', 'nwldx.com',
    'objectmail.com', 'obobbo.com', 'odaymail.com', 'oneoffemail.com',
    'onewaymail.com', 'oopi.org', 'oosln.com', 'otherinbox.com', 'outlawspam.com',
    'ovpn.to', 'owlpic.com', 'pancakemail.com', 'pokemail.net', 'poofy.org',
    'pookmail.com', 'privymail.de', 'proxymail.eu', 'qiott.com', 'quickinbox.com',
    'rcpt.at', 'receiveee.com', 'recode.me', 'regbypass.com', 'rfcdrive.com',
    'rhyta.com', 'rmqkr.net', 'rppkn.com', 'rteet.com', 'rtrtr.com',
    'safetymail.info', 'sandelf.de', 'selfdestructingmail.com', 'sendspamhere.com',
    'sharklasers.com', 'shiftmail.com', 'shitmail.me', 'shortmail.net',
    'skeefmail.com', 'slopsbox.com', 'smellfear.com', 'snakemail.com',
    'sneakemail.com', 'snkmail.com', 'sofimail.com', 'sofort-mail.de', 'sogetthis.com',
    'solvemail.info', 'spam.la', 'spam.su', 'spam4.me', 'spamavert.com',
    'spambob.com', 'spambog.com', 'spambog.de', 'spambog.ru', 'spambox.us',
    'spamcero.com', 'spamcon.org', 'spamcowboy.com', 'spamday.com', 'spamex.com',
    'spamfree24.com', 'spamfree24.de', 'spamfree24.eu', 'spamfree24.info',
    'spamfree24.net', 'spamfree24.org', 'spamgoes.in', 'spamgourmet.com',
    'spamherelots.com', 'spamhereplease.com', 'spamhole.com', 'spamify.com',
    'spaminator.de', 'spamkill.info', 'spaml.com', 'spammotel.com', 'spamobox.com',
    'spamoff.de', 'spamslicer.com', 'spamspot.com', 'spamthisplease.com',
    'spamtrail.com', 'spamtroll.net', 'spoofmail.de', 'stuffmail.de',
    'supergreatmail.com', 'superrito.com', 'suremail.info', 'teleworm.com',
    'teleworm.us', 'temp-mail.com', 'temp-mail.de', 'temp-mail.io', 'temp-mail.live',
    'temp-mail.org', 'temp-mail.ru', 'tempail.com', 'tempalias.com', 'tempe-mail.com',
    'tempemail.biz', 'tempemail.co.za', 'tempemail.com', 'tempemail.net',
    'tempinbox.co.uk', 'tempinbox.com', 'tempmail.com', 'tempmail.de',
    'tempmail.email', 'tempmail.eu', 'tempmail.it', 'tempmail.lol', 'tempmail.net',
    'tempmail.ninja', 'tempmail.org', 'tempmail.plus', 'tempmail.so', 'tempmail.us',
    'tempmail.ws', 'tempmail2.com', 'tempmailaddress.com', 'tempmaildemo.com',
    'tempmailer.com', 'tempmailer.de', 'tempmailo.com', 'tempomail.fr',
    'temporarily.de', 'temporarioemail.com.br', 'temporaryemail.net',
    'temporaryemail.us', 'temporaryforwarding.com', 'temporaryinbox.com',
    'temporarymailaddress.com', 'tempr.email', 'thisisnotmyrealemail.com',
    'thismail.net', 'throwam.com', 'throwaway.email', 'throwawaymail.com',
    'tmail.ws', 'tmailinator.com', 'tmailor.com', 'tmpmail.net', 'tmpmail.org',
    'tmpbox.net', 'tmpeml.info', 'toiea.com', 'trash-mail.at', 'trash-mail.com',
    'trashdevil.com', 'trashemail.de', 'trashmail.com', 'trashmail.de',
    'trashmail.me', 'trashmail.net', 'trashmail.org', 'trashmailer.com',
    'trashymail.com', 'twinmail.de', 'txcct.com', 'uggsrock.com', 'umail.net',
    'vddaz.com', 'venompen.com', 'veryrealemail.com', 'vomoto.com', 'vubby.com',
    'walkmail.net', 'webemail.me', 'wegwerfadresse.de', 'wegwerfemail.com',
    'wegwerfemail.de', 'wegwerfmail.de', 'wegwerfmail.info', 'wegwerfmail.net',
    'wegwerfmail.org', 'wh4f.org', 'whyspam.me', 'willselfdestruct.com',
    'wronghead.com', 'wuuvo.com', 'wwjmp.com', 'xagloo.com', 'xemaps.com',
    'xents.com', 'xmaily.com', 'xojxe.com', 'xoxy.net', 'yapped.net', 'yep.it',
    'yoggm.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'yuurok.com',
    'zehnminutenmail.de', 'zippymail.info', 'zoemail.net', 'zoemail.org', 'zomg.info'
  ];
  d text;
begin
  cleaned := lower(trim(coalesce(p_email, '')));
  if cleaned = '' then
    return false;
  end if;

  if length(cleaned) > 254 or cleaned !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return true;
  end if;

  local_part := split_part(cleaned, '@', 1);
  domain_part := split_part(cleaned, '@', 2);
  tld_part := substring(domain_part from '\.([^.]+)$');

  if tld_part is null or tld_part = any(array['local', 'localhost', 'internal', 'invalid', 'test', 'example', 'arpa', 'lan', 'home', 'corp', 'onion', 'localdomain']) then
    return true;
  end if;

  if domain_part ~* '(tempmail|temp-mail|tmp-mail|tmpmail|throwaway|guerrillamail|mailinator|yopmail|10minutemail|10minmail|20minutemail|trashmail|trash-mail|fakemail|fakeemail|fakeinbox|burnermail|disposablemail|dispostable|spambox|spamgourmet|getnada|mohmal|1secmail|maildrop|mailnesia|harakirimail|anonbox)' then
    return true;
  end if;

  foreach d in array blocked_domains loop
    if domain_part = d or domain_part like ('%.' || d) then
      return true;
    end if;
  end loop;

  base_local := split_part(local_part, '+', 1);
  compact_local := regexp_replace(base_local, '[^a-z0-9]', '', 'g');
  if base_local = any(array['fake', 'fakemail', 'fakeemail', 'dummy', 'temp', 'tempmail', 'throwaway', 'trash', 'spam', 'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'asdf', 'asdfgh', 'qwerty', 'zxcvbn', '1234', '12345', '123456', '12345678', '000000', '111111', 'aaaaaa', 'testuser', 'testaccount', 'null', 'void', 'none'])
     or compact_local = any(array['fake', 'fakemail', 'fakeemail', 'dummy', 'temp', 'tempmail', 'throwaway', 'trash', 'spam', 'noreply', 'donotreply', 'asdf', 'asdfgh', 'qwerty', 'zxcvbn', '12345', '123456', '000000', '111111', 'aaaaaa', 'testuser']) then
    return true;
  end if;

  if domain_part in ('gmail.com', 'googlemail.com') then
    gmail_canonical := replace(base_local, '.', '');
    if length(gmail_canonical) < 6 or length(gmail_canonical) > 30 then
      return true;
    end if;
  end if;

  return false;
end;
$$;

create or replace function private.enforce_legitimate_email_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and length(trim(new.email)) > 0 then
    if private.is_disposable_or_fake_email(new.email) then
      raise exception 'Temporary, disposable, or fake email addresses cannot register. Please use a legitimate personal, work, or school email.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.is_disposable_or_fake_email(text) from public, anon, authenticated;
revoke all on function private.enforce_legitimate_email_trigger() from public, anon, authenticated;

drop trigger if exists on_auth_user_validate_legitimate_email on auth.users;
create trigger on_auth_user_validate_legitimate_email
  before insert or update of email on auth.users
  for each row
  execute function private.enforce_legitimate_email_trigger();

drop trigger if exists on_user_profile_validate_legitimate_email on public.user_profiles;
create trigger on_user_profile_validate_legitimate_email
  before insert or update of email on public.user_profiles
  for each row
  execute function private.enforce_legitimate_email_trigger();

create or replace function private.handle_auth_user_profile_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
  derived_name text;
  derived_avatar text;
  derived_providers text[];
  latest_provider text;
begin
  normalized_email := lower(trim(coalesce(new.email, '')));
  if normalized_email = '' then
    return new;
  end if;

  derived_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(normalized_email, '@', 1)
  );

  derived_avatar := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'picture'), '')
  );

  select coalesce(array_agg(distinct p), '{}')
  into derived_providers
  from jsonb_array_elements_text(
    coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb)
  ) as p;

  latest_provider := nullif(trim(new.raw_app_meta_data ->> 'provider'), '');
  if latest_provider is not null and not (latest_provider = any(derived_providers)) then
    derived_providers := array_append(derived_providers, latest_provider);
  end if;

  insert into public.user_profiles (
    email,
    auth_user_id,
    display_name,
    avatar_url,
    auth_providers,
    last_sign_in_provider,
    last_sign_in_at
  )
  values (
    normalized_email,
    new.id,
    derived_name,
    derived_avatar,
    derived_providers,
    latest_provider,
    coalesce(new.last_sign_in_at, now())
  )
  on conflict (email) do update
  set
    auth_user_id = excluded.auth_user_id,
    display_name = coalesce(nullif(public.user_profiles.display_name, ''), excluded.display_name),
    avatar_url = coalesce(public.user_profiles.avatar_url, excluded.avatar_url),
    auth_providers = (
      select coalesce(array_agg(distinct p), '{}')
      from unnest(
        coalesce(public.user_profiles.auth_providers, '{}')
        || coalesce(excluded.auth_providers, '{}')
      ) as p
    ),
    last_sign_in_provider = coalesce(excluded.last_sign_in_provider, public.user_profiles.last_sign_in_provider),
    last_sign_in_at = coalesce(excluded.last_sign_in_at, now()),
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.handle_auth_user_profile_sync() from public, anon, authenticated;

drop trigger if exists on_auth_user_upsert_profile on auth.users;
create trigger on_auth_user_upsert_profile
  after insert or update on auth.users
  for each row
  execute function private.handle_auth_user_profile_sync();

-- 5. Storage bucket for profile avatars, portfolio covers & uploaded site media (150 MB cap)
insert into storage.buckets (id, name, public, file_size_limit)
values ('portfolio-media', 'portfolio-media', true, 157286400)
on conflict (id) do update set public = true, file_size_limit = 157286400;

drop policy if exists "Public read access for portfolio media" on storage.objects;
create policy "Public read access for portfolio media"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'portfolio-media');

drop policy if exists "Authenticated users can upload own portfolio media" on storage.objects;
create policy "Authenticated users can upload own portfolio media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'portfolio-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Authenticated users can update own portfolio media" on storage.objects;
create policy "Authenticated users can update own portfolio media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'portfolio-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'portfolio-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Authenticated users can delete own portfolio media" on storage.objects;
create policy "Authenticated users can delete own portfolio media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'portfolio-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 6. Real Portfolio Views, Hearts, & Comments
create table if not exists public.portfolio_stats (
  portfolio_id text primary key,
  view_count bigint not null default 0 check (view_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.portfolio_stats enable row level security;
revoke all on table public.portfolio_stats from anon, authenticated;
grant select on table public.portfolio_stats to anon, authenticated;

drop policy if exists "Anyone can view portfolio stats" on public.portfolio_stats;
create policy "Anyone can view portfolio stats"
  on public.portfolio_stats
  for select
  to anon, authenticated
  using (true);

-- Deduplicated view ledger (never directly readable/writable by clients)
create table if not exists public.portfolio_views (
  id uuid primary key default gen_random_uuid(),
  portfolio_id text not null,
  viewer_key text not null,
  viewed_at timestamptz not null default now(),
  unique (portfolio_id, viewer_key)
);

create index if not exists portfolio_views_recent_idx
  on public.portfolio_views (portfolio_id, viewer_key, viewed_at desc);

alter table public.portfolio_views enable row level security;
revoke all on table public.portfolio_views from anon, authenticated;

drop function if exists public.increment_portfolio_view(text);
drop function if exists public.increment_portfolio_view(text, text);

create or replace function public.increment_portfolio_view(
  p_portfolio_id text,
  p_viewer_key text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_id text;
  cleaned_viewer_key text;
  current_uid uuid;
  user_key text;
  device_key text;
  fp_key text;
  headers_json jsonb := '{}'::jsonb;
  client_ip text := '';
  user_agent text := '';
  is_owner boolean := false;
  already_counted boolean := false;
  next_count bigint := 0;
begin
  cleaned_id := trim(coalesce(p_portfolio_id, ''));
  if cleaned_id = '' then
    return 0;
  end if;

  cleaned_viewer_key := left(
    regexp_replace(trim(coalesce(p_viewer_key, '')), '[^a-zA-Z0-9._-]', '', 'g'),
    128
  );
  current_uid := auth.uid();

  -- Ensure stats row exists
  insert into public.portfolio_stats (portfolio_id, view_count, updated_at)
  values (cleaned_id, 0, now())
  on conflict (portfolio_id) do nothing;

  -- Exclude owner self-views from inflating counts
  if current_uid is not null then
    if cleaned_id like 'portfolio-%' then
      select exists (
        select 1
        from public.user_portfolios up
        where up.id::text = substring(cleaned_id from 11)
          and up.owner_user_id = current_uid
      ) into is_owner;
    elsif cleaned_id like 'published-%' then
      select exists (
        select 1
        from public.user_profiles pr
        where pr.id::text = substring(cleaned_id from 11)
          and pr.auth_user_id = current_uid
      ) into is_owner;
    end if;

    if is_owner then
      select view_count into next_count
      from public.portfolio_stats
      where portfolio_id = cleaned_id;
      return coalesce(next_count, 0);
    end if;
  end if;

  -- Safely inspect PostgREST request headers for guest/incognito same-device dedup
  begin
    headers_json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    headers_json := '{}'::jsonb;
  end;

  client_ip := coalesce(
    nullif(trim(headers_json ->> 'cf-connecting-ip'), ''),
    nullif(trim(headers_json ->> 'x-real-ip'), ''),
    nullif(trim(split_part(coalesce(headers_json ->> 'x-forwarded-for', ''), ',', 1)), ''),
    ''
  );
  user_agent := left(coalesce(trim(headers_json ->> 'user-agent'), ''), 256);

  if cleaned_viewer_key <> '' then
    device_key := 'dev:' || cleaned_viewer_key;
  end if;
  if client_ip <> '' then
    fp_key := 'fp:' || md5(client_ip || '|' || user_agent);
  end if;

  if current_uid is not null then
    user_key := 'user:' || current_uid::text;

    select exists (
      select 1
      from public.portfolio_views pv
      where pv.portfolio_id = cleaned_id
        and (
          pv.viewer_key = user_key
          or (device_key is not null and pv.viewer_key = device_key and pv.viewed_at > now() - interval '24 hours')
        )
    ) into already_counted;

    insert into public.portfolio_views (portfolio_id, viewer_key, viewed_at)
    values (cleaned_id, user_key, now())
    on conflict (portfolio_id, viewer_key) do nothing;
  else
    select exists (
      select 1
      from public.portfolio_views pv
      where pv.portfolio_id = cleaned_id
        and pv.viewed_at > now() - interval '24 hours'
        and (
          (device_key is not null and pv.viewer_key = device_key)
          or (fp_key is not null and pv.viewer_key = fp_key)
        )
    ) into already_counted;
  end if;

  if device_key is not null then
    insert into public.portfolio_views (portfolio_id, viewer_key, viewed_at)
    values (cleaned_id, device_key, now())
    on conflict (portfolio_id, viewer_key)
    do update set viewed_at = case
      when not already_counted then now()
      else public.portfolio_views.viewed_at
    end;
  end if;

  if fp_key is not null then
    insert into public.portfolio_views (portfolio_id, viewer_key, viewed_at)
    values (cleaned_id, fp_key, now())
    on conflict (portfolio_id, viewer_key)
    do update set viewed_at = case
      when not already_counted then now()
      else public.portfolio_views.viewed_at
    end;
  end if;

  if already_counted then
    select view_count into next_count
    from public.portfolio_stats
    where portfolio_id = cleaned_id;
    return coalesce(next_count, 0);
  end if;

  update public.portfolio_stats
  set
    view_count = public.portfolio_stats.view_count + 1,
    updated_at = now()
  where portfolio_id = cleaned_id
  returning view_count into next_count;

  -- Keep deduplication ledger bounded by occasionally pruning entries older than 30 days
  if random() < 0.05 then
    delete from public.portfolio_views
    where viewed_at < now() - interval '30 days';
  end if;

  return coalesce(next_count, 0);
end;
$$;

revoke all on function public.increment_portfolio_view(text, text) from public;
grant execute on function public.increment_portfolio_view(text, text) to anon, authenticated;

-- Authenticated-only Hearts (1 heart per user per portfolio)
create table if not exists public.portfolio_hearts (
  id uuid primary key default gen_random_uuid(),
  portfolio_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (portfolio_id, user_id)
);

create index if not exists portfolio_hearts_portfolio_idx
  on public.portfolio_hearts (portfolio_id);

create index if not exists portfolio_hearts_user_idx
  on public.portfolio_hearts (user_id, portfolio_id);

alter table public.portfolio_hearts enable row level security;
revoke all on table public.portfolio_hearts from anon, authenticated;
grant select on table public.portfolio_hearts to anon, authenticated;
grant insert, delete on table public.portfolio_hearts to authenticated;

drop policy if exists "Anyone can view portfolio hearts" on public.portfolio_hearts;
create policy "Anyone can view portfolio hearts"
  on public.portfolio_hearts
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can heart portfolios" on public.portfolio_hearts;
create policy "Authenticated users can heart portfolios"
  on public.portfolio_hearts
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Authenticated users can unheart own hearts" on public.portfolio_hearts;
create policy "Authenticated users can unheart own hearts"
  on public.portfolio_hearts
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Comments (Readable by all, writable/deletable by authenticated author; supports threaded replies)
create table if not exists public.portfolio_comments (
  id uuid primary key default gen_random_uuid(),
  portfolio_id text not null,
  parent_comment_id uuid references public.portfolio_comments(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_username text,
  author_avatar_url text,
  body text not null check (char_length(trim(body)) between 1 and 1500),
  created_at timestamptz not null default now()
);

alter table public.portfolio_comments
  add column if not exists parent_comment_id uuid references public.portfolio_comments(id) on delete cascade;

create index if not exists portfolio_comments_portfolio_created_idx
  on public.portfolio_comments (portfolio_id, created_at desc);

create index if not exists portfolio_comments_parent_idx
  on public.portfolio_comments (portfolio_id, parent_comment_id, created_at asc);

alter table public.portfolio_comments enable row level security;
revoke all on table public.portfolio_comments from anon, authenticated;
grant select on table public.portfolio_comments to anon, authenticated;
grant insert, delete on table public.portfolio_comments to authenticated;

drop policy if exists "Anyone can view portfolio comments" on public.portfolio_comments;
create policy "Anyone can view portfolio comments"
  on public.portfolio_comments
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can post comments" on public.portfolio_comments;
create policy "Authenticated users can post comments"
  on public.portfolio_comments
  for insert
  to authenticated
  with check (author_user_id = (select auth.uid()));

drop policy if exists "Authors can delete own comments" on public.portfolio_comments;
create policy "Authors can delete own comments"
  on public.portfolio_comments
  for delete
  to authenticated
  using (author_user_id = (select auth.uid()));

-- Enforce verified author metadata & valid same-portfolio parent_comment_id on insert
create or replace function private.sync_portfolio_comment_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prof record;
  parent_portfolio_id text;
begin
  if new.parent_comment_id is not null then
    select pc.portfolio_id
    into parent_portfolio_id
    from public.portfolio_comments pc
    where pc.id = new.parent_comment_id
    limit 1;

    if not found or parent_portfolio_id <> new.portfolio_id then
      raise exception 'Parent comment does not belong to this portfolio.';
    end if;
  end if;

  select display_name, username, avatar_url
  into prof
  from public.user_profiles
  where auth_user_id = new.author_user_id
  limit 1;

  if found then
    new.author_name := coalesce(nullif(trim(prof.display_name), ''), nullif(trim(new.author_name), ''), 'Class A Member');
    new.author_username := nullif(trim(prof.username), '');
    new.author_avatar_url := nullif(trim(prof.avatar_url), '');
  end if;

  return new;
end;
$$;

revoke all on function private.sync_portfolio_comment_author() from public, anon, authenticated;

drop trigger if exists on_portfolio_comment_sync_author on public.portfolio_comments;
create trigger on_portfolio_comment_sync_author
  before insert on public.portfolio_comments
  for each row
  execute function private.sync_portfolio_comment_author();

-- Comment Reactions (Readable by all; 1 reaction per user per comment, one-time only)
create table if not exists public.portfolio_comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.portfolio_comments(id) on delete cascade,
  portfolio_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '🔥', '👏', '🚀', '💡')),
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

-- Upgrade cleanly if table existed with per-emoji uniqueness previously: keep earliest reaction per (comment_id, user_id)
delete from public.portfolio_comment_reactions a
using public.portfolio_comment_reactions b
where a.comment_id = b.comment_id
  and a.user_id = b.user_id
  and (
    a.created_at > b.created_at
    or (a.created_at = b.created_at and a.id > b.id)
  );

alter table public.portfolio_comment_reactions
  drop constraint if exists portfolio_comment_reactions_comment_id_user_id_emoji_key;

create unique index if not exists portfolio_comment_reactions_single_user_comment_idx
  on public.portfolio_comment_reactions (comment_id, user_id);

create index if not exists portfolio_comment_reactions_portfolio_idx
  on public.portfolio_comment_reactions (portfolio_id, comment_id);

create index if not exists portfolio_comment_reactions_user_idx
  on public.portfolio_comment_reactions (user_id, portfolio_id);

alter table public.portfolio_comment_reactions enable row level security;
revoke all on table public.portfolio_comment_reactions from anon, authenticated;
grant select on table public.portfolio_comment_reactions to anon, authenticated;
grant insert on table public.portfolio_comment_reactions to authenticated;

drop policy if exists "Anyone can view comment reactions" on public.portfolio_comment_reactions;
create policy "Anyone can view comment reactions"
  on public.portfolio_comment_reactions
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can add comment reactions" on public.portfolio_comment_reactions;
create policy "Authenticated users can add comment reactions"
  on public.portfolio_comment_reactions
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Authenticated users can remove own comment reactions" on public.portfolio_comment_reactions;

-- Derive portfolio_id from parent comment so reaction rows can never mismatch comment's portfolio
create or replace function private.sync_comment_reaction_portfolio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_portfolio_id text;
begin
  select pc.portfolio_id
  into target_portfolio_id
  from public.portfolio_comments pc
  where pc.id = new.comment_id
  limit 1;

  if not found then
    raise exception 'Target comment does not exist.';
  end if;

  new.portfolio_id := target_portfolio_id;
  return new;
end;
$$;

revoke all on function private.sync_comment_reaction_portfolio() from public, anon, authenticated;

drop trigger if exists on_comment_reaction_sync_portfolio on public.portfolio_comment_reactions;
create trigger on_comment_reaction_sync_portfolio
  before insert on public.portfolio_comment_reactions
  for each row
  execute function private.sync_comment_reaction_portfolio();

-- 7. Logged-User Uploaded Portfolio (Strictly 1 portfolio per user + Static HTML/ZIP Upload, GitHub, URL, or Showcase)
create table if not exists public.user_portfolios (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null default '',
  title text not null,
  discipline text not null default 'Full-Stack',
  summary text not null default '',
  cover_image_url text,
  source_type text not null default 'upload' check (source_type in ('upload', 'url', 'showcase')),
  thumbnail_mode text not null default 'image' check (thumbnail_mode in ('homepage', 'image', 'live')),
  portfolio_url text,
  portfolio_html text,
  entry_file text,
  uploaded_files jsonb not null default '[]'::jsonb,
  skills text[] not null default '{}',
  highlights text[] not null default '{}',
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_portfolios
  add column if not exists thumbnail_mode text not null default 'image';

-- Keep only the latest portfolio per owner before enforcing 1-portfolio-per-user uniqueness
delete from public.user_portfolios a
using public.user_portfolios b
where a.owner_user_id = b.owner_user_id
  and (
    a.updated_at < b.updated_at
    or (a.updated_at = b.updated_at and a.id < b.id)
  );

create unique index if not exists user_portfolios_single_owner_unique_idx
  on public.user_portfolios (owner_user_id);

create index if not exists user_portfolios_owner_idx
  on public.user_portfolios (owner_user_id, updated_at desc);

create index if not exists user_portfolios_published_idx
  on public.user_portfolios (is_published, published_at desc);

alter table public.user_portfolios enable row level security;
revoke all on table public.user_portfolios from anon, authenticated;
grant select, insert, update, delete on table public.user_portfolios to authenticated;

drop policy if exists "Anyone can view published user portfolios" on public.user_portfolios;

drop policy if exists "Owners can view own user portfolios" on public.user_portfolios;
create policy "Owners can view own user portfolios"
  on public.user_portfolios
  for select
  to authenticated
  using (owner_user_id = (select auth.uid()));

drop policy if exists "Owners can insert own user portfolios" on public.user_portfolios;
create policy "Owners can insert own user portfolios"
  on public.user_portfolios
  for insert
  to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and owner_email = lower(trim(coalesce((select auth.jwt() ->> 'email'), '')))
  );

drop policy if exists "Owners can update own user portfolios" on public.user_portfolios;
create policy "Owners can update own user portfolios"
  on public.user_portfolios
  for update
  to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (
    owner_user_id = (select auth.uid())
    and owner_email = lower(trim(coalesce((select auth.jwt() ->> 'email'), '')))
  );

drop policy if exists "Owners can delete own user portfolios" on public.user_portfolios;
create policy "Owners can delete own user portfolios"
  on public.user_portfolios
  for delete
  to authenticated
  using (owner_user_id = (select auth.uid()));

-- Drop broad public author policy on user_profiles so PII emails stay hidden
drop policy if exists "Anyone can view profile of published portfolio authors" on public.user_profiles;

-- 8. Privacy-preserving & lightweight Public Gallery RPCs (omits emails, auth metadata, and heavy HTML unless needed for live/homepage card thumbnails)
drop function if exists public.get_public_portfolios();
create or replace function public.get_public_portfolios()
returns table (
  id uuid,
  owner_user_id uuid,
  title text,
  discipline text,
  summary text,
  cover_image_url text,
  source_type text,
  thumbnail_mode text,
  portfolio_url text,
  portfolio_html text,
  has_uploaded_html boolean,
  entry_file text,
  skills text[],
  highlights text[],
  is_published boolean,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  author_bio text,
  author_roll_number text,
  author_role_title text,
  author_social_links jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    up.id,
    up.owner_user_id,
    up.title,
    up.discipline,
    up.summary,
    up.cover_image_url,
    up.source_type,
    up.thumbnail_mode,
    up.portfolio_url,
    case
      when up.source_type = 'upload' and up.thumbnail_mode in ('homepage', 'live')
        then up.portfolio_html
      else null
    end as portfolio_html,
    (up.source_type = 'upload' and coalesce(length(trim(up.portfolio_html)), 0) > 0) as has_uploaded_html,
    up.entry_file,
    up.skills,
    up.highlights,
    up.is_published,
    up.published_at,
    up.created_at,
    up.updated_at,
    pr.username as author_username,
    pr.display_name as author_display_name,
    pr.avatar_url as author_avatar_url,
    pr.bio as author_bio,
    pr.roll_number as author_roll_number,
    pr.role_title as author_role_title,
    pr.social_links as author_social_links
  from public.user_portfolios up
  left join public.user_profiles pr
    on pr.auth_user_id = up.owner_user_id
  where up.is_published = true
  order by up.published_at desc nulls last;
$$;

revoke all on function public.get_public_portfolios() from public;
grant execute on function public.get_public_portfolios() to anon, authenticated;

drop function if exists public.get_public_legacy_profiles();
create or replace function public.get_public_legacy_profiles()
returns table (
  id uuid,
  auth_user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  roll_number text,
  role_title text,
  discipline text,
  project_title text,
  project_summary text,
  cover_image_url text,
  portfolio_url text,
  skills text[],
  highlights text[],
  social_links jsonb,
  is_published boolean,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pr.id,
    pr.auth_user_id,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    pr.bio,
    pr.roll_number,
    pr.role_title,
    pr.discipline,
    pr.project_title,
    pr.project_summary,
    pr.cover_image_url,
    pr.portfolio_url,
    pr.skills,
    pr.highlights,
    pr.social_links,
    pr.is_published,
    pr.published_at,
    pr.updated_at
  from public.user_profiles pr
  where pr.is_published = true
    and (
      pr.auth_user_id is null
      or not exists (
        select 1
        from public.user_portfolios up
        where up.owner_user_id = pr.auth_user_id
          and up.is_published = true
      )
    )
  order by pr.published_at desc nulls last;
$$;

revoke all on function public.get_public_legacy_profiles() from public;
grant execute on function public.get_public_legacy_profiles() to anon, authenticated;

-- On-demand HTML + source file detail hydration when opening Review Studio, TV Feed, or Code View
drop function if exists public.get_portfolio_html_detail(text);
create or replace function public.get_portfolio_html_detail(p_portfolio_id text)
returns table (
  portfolio_html text,
  uploaded_files jsonb,
  entry_file text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cleaned text;
  target_uuid uuid;
begin
  cleaned := regexp_replace(trim(coalesce(p_portfolio_id, '')), '^portfolio-', '');
  if cleaned = '' then
    return;
  end if;

  begin
    target_uuid := cleaned::uuid;
  exception when others then
    return;
  end;

  return query
  select
    up.portfolio_html,
    up.uploaded_files,
    up.entry_file
  from public.user_portfolios up
  where up.id = target_uuid
    and (up.is_published = true or up.owner_user_id = auth.uid())
  limit 1;
end;
$$;

revoke all on function public.get_portfolio_html_detail(text) from public;
grant execute on function public.get_portfolio_html_detail(text) to anon, authenticated;

-- Server-side engagement summary (replaces downloading every raw heart & comment row)
drop function if exists public.get_portfolio_engagement_summary();
create or replace function public.get_portfolio_engagement_summary()
returns table (
  portfolio_id text,
  view_count bigint,
  heart_count bigint,
  comment_count bigint,
  liked_by_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with all_ids as (
    select ps.portfolio_id from public.portfolio_stats ps
    union
    select ph.portfolio_id from public.portfolio_hearts ph
    union
    select pc.portfolio_id from public.portfolio_comments pc
  ),
  heart_agg as (
    select
      ph.portfolio_id,
      count(*)::bigint as heart_count,
      coalesce(bool_or(ph.user_id = auth.uid()), false) as liked_by_me
    from public.portfolio_hearts ph
    group by ph.portfolio_id
  ),
  comment_agg as (
    select
      pc.portfolio_id,
      count(*)::bigint as comment_count
    from public.portfolio_comments pc
    group by pc.portfolio_id
  )
  select
    a.portfolio_id,
    coalesce(ps.view_count, 0)::bigint as view_count,
    coalesce(ha.heart_count, 0)::bigint as heart_count,
    coalesce(ca.comment_count, 0)::bigint as comment_count,
    coalesce(ha.liked_by_me, false) as liked_by_me
  from all_ids a
  left join public.portfolio_stats ps on ps.portfolio_id = a.portfolio_id
  left join heart_agg ha on ha.portfolio_id = a.portfolio_id
  left join comment_agg ca on ca.portfolio_id = a.portfolio_id;
$$;

revoke all on function public.get_portfolio_engagement_summary() from public;
grant execute on function public.get_portfolio_engagement_summary() to anon, authenticated;

-- Privacy-preserving @username mention lookup (never exposes emails)
drop function if exists public.search_mentionable_users(text);
create or replace function public.search_mentionable_users(p_query text default '')
returns table (
  auth_user_id uuid,
  username text,
  display_name text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cleaned text;
  escaped text;
begin
  cleaned := lower(trim(coalesce(p_query, '')));
  cleaned := regexp_replace(cleaned, '^@+', '');
  escaped := replace(replace(replace(cleaned, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  select
    pr.auth_user_id,
    pr.username,
    pr.display_name,
    pr.avatar_url
  from public.user_profiles pr
  where pr.auth_user_id is not null
    and pr.username is not null
    and length(trim(pr.username)) > 0
    and (
      escaped = ''
      or pr.username ilike ('%' || escaped || '%') escape '\'
      or pr.display_name ilike ('%' || escaped || '%') escape '\'
    )
  order by
    case when escaped <> '' and pr.username ilike (escaped || '%') escape '\' then 0 else 1 end,
    pr.username asc
  limit 50;
end;
$$;

revoke all on function public.search_mentionable_users(text) from public;
grant execute on function public.search_mentionable_users(text) to anon, authenticated;

-- Exact batch verification for @username mentions (returns only existing registered usernames)
drop function if exists public.check_mentionable_usernames(text[]);
create or replace function public.check_mentionable_usernames(p_usernames text[])
returns table (
  username text,
  display_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pr.username,
    pr.display_name,
    pr.avatar_url
  from public.user_profiles pr
  where pr.auth_user_id is not null
    and pr.username is not null
    and length(trim(pr.username)) > 0
    and lower(pr.username) = any (
      select lower(regexp_replace(trim(u), '^@+', ''))
      from unnest(coalesce(p_usernames, '{}'::text[])) as u
      where trim(u) <> ''
    );
$$;

revoke all on function public.check_mentionable_usernames(text[]) from public;
grant execute on function public.check_mentionable_usernames(text[]) to anon, authenticated;
