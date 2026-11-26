export interface EmailValidationResult {
  valid: boolean;
  normalizedEmail: string;
  localPart: string;
  domain: string;
  reason?: string;
  code?:
    | 'syntax'
    | 'reserved'
    | 'typo'
    | 'disposable'
    | 'fake'
    | 'no_mx'
    | 'disposable_mx';
}

const RESERVED_OR_INVALID_TLDS = new Set([
  'local',
  'localhost',
  'internal',
  'invalid',
  'test',
  'example',
  'arpa',
  'lan',
  'home',
  'corp',
  'onion',
  'localdomain',
]);

const DOMAIN_TYPO_SUGGESTIONS: Record<string, string> = {
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com',
  'googlemai.com': 'googlemail.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  'hotmal.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'icloud.con': 'icloud.com',
  'icoud.com': 'icloud.com',
  'protonmail.con': 'protonmail.com',
};

// Known legitimate consumer/privacy mailers with verified active MX infrastructure
const TRUSTED_EMAIL_PROVIDERS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'yahoo.com',
  'ymail.com',
  'rocketmail.com',
  'proton.me',
  'protonmail.com',
  'protonmail.ch',
  'pm.me',
  'zoho.com',
  'zohomail.com',
  'aol.com',
  'fastmail.com',
  'fastmail.fm',
  'tuta.com',
  'tuta.io',
  'tutanota.com',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'hey.com',
  'yandex.com',
  'qq.com',
  '163.com',
  'naver.com',
]);

// Placeholder, demo, and fake non-personal domains
const FAKE_PLACEHOLDER_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'example.edu',
  'test.com',
  'test.org',
  'test.net',
  'test.edu',
  'testing.com',
  'fake.com',
  'fake.org',
  'fake.net',
  'fakemail.com',
  'fakemail.net',
  'fakemail.org',
  'fakemail.fr',
  'fakeemail.com',
  'dummy.com',
  'dummyemail.com',
  'none.com',
  'null.com',
  'noemail.com',
  'nomail.com',
  'asdf.com',
  'qwerty.com',
  'abc.com',
  'xyz.com',
  '123.com',
  'a.com',
  'aa.com',
  'aaa.com',
  'domain.com',
  'email.com',
  'sample.com',
  'demo.com',
  'se-class-a.edu',
]);

// Comprehensive list of disposable, temporary, 10-minute, and burner email providers
export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  '10mail.org',
  '10mail.tk',
  '10minmail.com',
  '10minutemail.co.uk',
  '10minutemail.com',
  '10minutemail.de',
  '10minutemail.net',
  '10minutemail.org',
  '1secmail.com',
  '1secmail.net',
  '1secmail.org',
  '20email.eu',
  '20minutemail.com',
  '30minutemail.com',
  '60minutemail.com',
  'anonbox.net',
  'anonymbox.com',
  'armyspy.com',
  'binkmail.com',
  'bobmail.info',
  'bouncr.com',
  'bugmenot.com',
  'burner.kiwi',
  'burnermail.io',
  'byom.de',
  'cachedot.net',
  'chammy.info',
  'cheatmail.de',
  'clrmail.com',
  'cool.fr.nf',
  'correo.blogos.net',
  'courriel.fr.nf',
  'crazymailing.com',
  'cuvox.de',
  'dandikmail.com',
  'dayrep.com',
  'dcctb.com',
  'deadaddress.com',
  'despam.it',
  'devnullmail.com',
  'discard.email',
  'discardmail.com',
  'discardmail.de',
  'disposeamail.com',
  'dispostable.com',
  'dodgit.com',
  'dontreg.com',
  'dpptd.com',
  'dropmail.me',
  'e4ward.com',
  'einrot.com',
  'email60.com',
  'emailfake.com',
  'emailias.com',
  'emailinfive.com',
  'emailondeck.com',
  'emailsensei.com',
  'emailtemporanea.com',
  'emailtemporario.com.br',
  'emailthe.net',
  'emailwarden.com',
  'emkei.cz',
  'esiix.com',
  'eyepaste.com',
  'ezztt.com',
  'fakeinbox.com',
  'fakemail.io',
  'fakemailgenerator.com',
  'fastacura.com',
  'filzmail.com',
  'fixmail.tk',
  'fleckens.hu',
  'flyspam.com',
  'fr33mail.info',
  'garbagemail.org',
  'generator.email',
  'getairmail.com',
  'getnada.com',
  'getonemail.com',
  'ghosttexter.de',
  'girlsundertheinfluence.com',
  'gishpuppy.com',
  'grr.la',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'gustr.com',
  'haltospam.com',
  'harakirimail.com',
  'hidemail.de',
  'hotpop.com',
  'icznn.com',
  'ieh-mail.de',
  'illubd.com',
  'imails.info',
  'inboxalias.com',
  'inboxbear.com',
  'inboxclean.com',
  'inboxkitten.com',
  'incognitomail.com',
  'incognitomail.net',
  'incognitomail.org',
  'insorg-mail.info',
  'instant-mail.de',
  'ipoo.org',
  'jetable.com',
  'jetable.fr.nf',
  'jetable.net',
  'jetable.org',
  'jnxjn.com',
  'jourrapide.com',
  'junk1e.com',
  'karenkey.com',
  'kasmail.com',
  'keepmymail.com',
  'killmail.com',
  'killmail.net',
  'klzlk.com',
  'koszmail.pl',
  'kurzepost.de',
  'kzccv.com',
  'laafd.com',
  'letthemeatspam.com',
  'lhsdv.com',
  'lifebyfood.com',
  'link2mail.net',
  'litedrop.com',
  'lol.ovpn.to',
  'lookugly.com',
  'lopl.co.cc',
  'lortemail.dk',
  'lr78.com',
  'maboard.com',
  'mail-temporaire.fr',
  'mail.by',
  'mail.gw',
  'mail.mezimages.net',
  'mail.tm',
  'mail2rss.org',
  'mail333.com',
  'mail4trash.com',
  'mailbidon.com',
  'mailblocks.com',
  'mailbucket.org',
  'mailcatch.com',
  'maildrop.cc',
  'maildx.com',
  'maileater.com',
  'maileimer.de',
  'mailexpire.com',
  'mailfa.tk',
  'mailforspam.com',
  'mailfreeonline.com',
  'mailin8r.com',
  'mailinater.com',
  'mailinator.com',
  'mailinator.gq',
  'mailinator.net',
  'mailinator.org',
  'mailinator2.com',
  'mailincubator.com',
  'mailismagic.com',
  'mailmate.com',
  'mailme.ir',
  'mailme.lv',
  'mailmetrash.com',
  'mailmoat.com',
  'mailnator.com',
  'mailnesia.com',
  'mailnull.com',
  'mailscrap.com',
  'mailshell.com',
  'mailsiphon.com',
  'mailslite.com',
  'mailtemp.info',
  'mailtothis.com',
  'mailzi.ru',
  'mailzilla.com',
  'mbx.cc',
  'mega.zik.dj',
  'meltmail.com',
  'messagebeamer.de',
  'mezimages.net',
  'mfsa.ru',
  'midcoastcustoms.com',
  'minex-email.com',
  'mintemail.com',
  'minutemailbox.com',
  'mjukg.com',
  'moakt.cc',
  'moakt.com',
  'moakt.ws',
  'mobi.web.id',
  'moburl.com',
  'mohmal.com',
  'mohmal.im',
  'mohmal.in',
  'mohmal.tech',
  'moncourrier.fr.nf',
  'monemail.fr.nf',
  'monmail.fr.nf',
  'monumentmail.com',
  'ms9.mailslite.com',
  'msb.minsmail.com',
  'msgos.com',
  'mt2014.com',
  'mt2015.com',
  'mvrht.net',
  'my10minutemail.com',
  'mymailoasis.com',
  'mynetstore.de',
  'mypacks.net',
  'mypartyclip.de',
  'myphantomemail.com',
  'myspaceinc.com',
  'mytemp.email',
  'mytempmail.com',
  'mytrashmail.com',
  'nada.email',
  'nada.ltd',
  'neomailbox.com',
  'nepwk.com',
  'nervmich.net',
  'nervtmich.net',
  'netmails.com',
  'netmails.net',
  'neverbox.com',
  'no-spam.ws',
  'nobulk.com',
  'noclickemail.com',
  'nogmailspam.info',
  'nomail.pw',
  'nomail.xl.cx',
  'nomail2me.com',
  'nomorespamemails.com',
  'nospam.ze.tc',
  'nospam4.us',
  'nospamfor.us',
  'nospamthanks.info',
  'notmailinator.com',
  'nowmymail.com',
  'nurfuerspam.de',
  'nwldx.com',
  'objectmail.com',
  'obobbo.com',
  'odaymail.com',
  'oneoffemail.com',
  'onewaymail.com',
  'online.ms',
  'oopi.org',
  'oosln.com',
  'ordinaryamerican.net',
  'otherinbox.com',
  'ourklips.com',
  'outlawspam.com',
  'ovpn.to',
  'owlpic.com',
  'pancakemail.com',
  'pimpedupmyspace.com',
  'plexolan.de',
  'pokemail.net',
  'politikerclub.de',
  'poofy.org',
  'pookmail.com',
  'privymail.de',
  'proxymail.eu',
  'prtnx.com',
  'putthisinyourspamdatabase.com',
  'qiott.com',
  'quickinbox.com',
  'rcpt.at',
  'receiveee.com',
  'recode.me',
  'regbypass.com',
  'rfcdrive.com',
  'rhyta.com',
  'rmqkr.net',
  'royal.net',
  'rppkn.com',
  'rteet.com',
  'rtrtr.com',
  's0ny.net',
  'safe-mail.net',
  'safetymail.info',
  'sandelf.de',
  'saynotospams.com',
  'selfdestructingmail.com',
  'sendspamhere.com',
  'sharklasers.com',
  'shiftmail.com',
  'shitmail.me',
  'shortmail.net',
  'sibmail.com',
  'skeefmail.com',
  'slaskpost.se',
  'slopsbox.com',
  'smellfear.com',
  'snakemail.com',
  'sneakemail.com',
  'snkmail.com',
  'sofimail.com',
  'sofort-mail.de',
  'sogetthis.com',
  'solvemail.info',
  'soodonims.com',
  'spam.la',
  'spam.su',
  'spam4.me',
  'spamavert.com',
  'spambob.com',
  'spambob.net',
  'spambob.org',
  'spambog.com',
  'spambog.de',
  'spambog.ru',
  'spambox.us',
  'spamcero.com',
  'spamcon.org',
  'spamcorptastic.com',
  'spamcowboy.com',
  'spamcowboy.net',
  'spamcowboy.org',
  'spamday.com',
  'spamex.com',
  'spamfree24.com',
  'spamfree24.de',
  'spamfree24.eu',
  'spamfree24.info',
  'spamfree24.net',
  'spamfree24.org',
  'spamgoes.in',
  'spamgourmet.com',
  'spamherelots.com',
  'spamhereplease.com',
  'spamhole.com',
  'spamify.com',
  'spaminator.de',
  'spamkill.info',
  'spaml.com',
  'spaml.de',
  'spammotel.com',
  'spamobox.com',
  'spamoff.de',
  'spamslicer.com',
  'spamspot.com',
  'spamthis.co.uk',
  'spamthisplease.com',
  'spamtrail.com',
  'spamtroll.net',
  'speed.1s.fr',
  'spoofmail.de',
  'stuffmail.de',
  'supergreatmail.com',
  'supermailer.jp',
  'superrito.com',
  'suremail.info',
  'tagyourself.com',
  'teewars.org',
  'teleworm.com',
  'teleworm.us',
  'temp-mail.com',
  'temp-mail.de',
  'temp-mail.io',
  'temp-mail.live',
  'temp-mail.org',
  'temp-mail.ru',
  'temp.emeraldwebmail.com',
  'tempail.com',
  'tempalias.com',
  'tempe-mail.com',
  'tempemail.biz',
  'tempemail.co.za',
  'tempemail.com',
  'tempemail.net',
  'tempinbox.co.uk',
  'tempinbox.com',
  'tempmail.com',
  'tempmail.de',
  'tempmail.email',
  'tempmail.eu',
  'tempmail.it',
  'tempmail.lol',
  'tempmail.net',
  'tempmail.ninja',
  'tempmail.org',
  'tempmail.plus',
  'tempmail.so',
  'tempmail.us',
  'tempmail.ws',
  'tempmail2.com',
  'tempmailaddress.com',
  'tempmaildemo.com',
  'tempmailer.com',
  'tempmailer.de',
  'tempmailo.com',
  'tempomail.fr',
  'temporarily.de',
  'temporarioemail.com.br',
  'temporaryemail.net',
  'temporaryemail.us',
  'temporaryforwarding.com',
  'temporaryinbox.com',
  'temporarymailaddress.com',
  'tempr.email',
  'thanksnospam.info',
  'thankyou2010.com',
  'thc.st',
  'thelimestones.com',
  'thisisnotmyrealemail.com',
  'thismail.net',
  'throwam.com',
  'throwaway.email',
  'throwawaymail.com',
  'tmail.ws',
  'tmailinator.com',
  'tmailor.com',
  'tmpmail.net',
  'tmpmail.org',
  'tmpbox.net',
  'tmpeml.info',
  'toiea.com',
  'tradermail.info',
  'trash-amil.com',
  'trash-mail.at',
  'trash-mail.com',
  'trash2009.com',
  'trashdevil.com',
  'trashemail.de',
  'trashmail.com',
  'trashmail.de',
  'trashmail.me',
  'trashmail.net',
  'trashmail.org',
  'trashmailer.com',
  'trashymail.com',
  'trollope.org',
  'turual.com',
  'twinmail.de',
  'txcct.com',
  'tyldd.com',
  'uggsrock.com',
  'umail.net',
  'upliftnow.com',
  'uplipht.com',
  'uroid.com',
  'vddaz.com',
  'venompen.com',
  'veryrealemail.com',
  'viditag.com',
  'viewcastmedia.com',
  'viewcastmedia.net',
  'viewcastmedia.org',
  'vomoto.com',
  'vubby.com',
  'walala.org',
  'walkmail.net',
  'webemail.me',
  'wegwerfadresse.de',
  'wegwerfemail.com',
  'wegwerfemail.de',
  'wegwerfmail.de',
  'wegwerfmail.info',
  'wegwerfmail.net',
  'wegwerfmail.org',
  'wetrainbayarea.com',
  'wetrainbayarea.org',
  'wh4f.org',
  'whatiaas.com',
  'whyspam.me',
  'willhackforfood.biz',
  'willselfdestruct.com',
  'winemaven.info',
  'wronghead.com',
  'wuuvo.com',
  'wuzup.net',
  'wuzupmail.net',
  'wwjmp.com',
  'xagloo.com',
  'xemaps.com',
  'xents.com',
  'xmaily.com',
  'xojxe.com',
  'xoxy.net',
  'yapped.net',
  'yep.it',
  'yogamaven.com',
  'yoggm.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'yuurok.com',
  'zehnminutenmail.de',
  'zippymail.info',
  'zoaxe.com',
  'zoemail.net',
  'zoemail.org',
  'zomg.info',
]);

const DISPOSABLE_KEYWORD_REGEX =
  /(tempmail|temp-mail|tmp-mail|tmpmail|throwaway|guerrillamail|mailinator|yopmail|10minutemail|10minmail|20minutemail|trashmail|trash-mail|fakemail|fakeemail|fakeinbox|burnermail|disposablemail|dispostable|spambox|spamgourmet|getnada|mohmal|1secmail|maildrop|mailnesia|harakirimail|anonbox)/i;

const FAKE_LOCAL_PART_EXACT = new Set([
  'fake',
  'fakemail',
  'fakeemail',
  'dummy',
  'temp',
  'tempmail',
  'throwaway',
  'trash',
  'spam',
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'asdf',
  'asdfgh',
  'asdfghjkl',
  'qwerty',
  'qwertyuiop',
  'zxcvbn',
  '1234',
  '12345',
  '123456',
  '1234567',
  '12345678',
  '000000',
  '111111',
  'aaaaaa',
  'testuser',
  'testaccount',
  'null',
  'void',
  'none',
]);

function matchesDomainOrSubdomain(domain: string, set: Set<string>): boolean {
  if (set.has(domain)) return true;
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i += 1) {
    const parent = parts.slice(i).join('.');
    if (set.has(parent)) return true;
  }
  return false;
}

export function validateEmailSyntaxAndReputation(
  rawEmail: string
): EmailValidationResult {
  const normalizedEmail = rawEmail.trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail.length > 254) {
    return {
      valid: false,
      normalizedEmail,
      localPart: '',
      domain: '',
      code: 'syntax',
      reason: 'Enter a valid email address.',
    };
  }

  const atParts = normalizedEmail.split('@');
  if (atParts.length !== 2) {
    return {
      valid: false,
      normalizedEmail,
      localPart: '',
      domain: '',
      code: 'syntax',
      reason: 'Enter a valid email address.',
    };
  }

  const [localPart, domain] = atParts;
  if (
    !localPart ||
    localPart.length > 64 ||
    localPart.startsWith('.') ||
    localPart.endsWith('.') ||
    localPart.includes('..') ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(localPart)
  ) {
    return {
      valid: false,
      normalizedEmail,
      localPart,
      domain,
      code: 'syntax',
      reason: 'Enter a valid email address before the @ symbol.',
    };
  }

  if (
    !domain ||
    domain.length < 3 ||
    domain.length > 253 ||
    !domain.includes('.') ||
    domain.includes('..')
  ) {
    return {
      valid: false,
      normalizedEmail,
      localPart,
      domain,
      code: 'syntax',
      reason: 'Enter a valid email domain (for example: name@gmail.com).',
    };
  }

  const domainLabels = domain.split('.');
  const validLabels = domainLabels.every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  );
  const tld = domainLabels[domainLabels.length - 1] ?? '';
  if (!validLabels || !/^[a-z]{2,24}$/i.test(tld)) {
    return {
      valid: false,
      normalizedEmail,
      localPart,
      domain,
      code: 'syntax',
      reason: 'Enter a valid domain extension (for example: .com, .edu, .org).',
    };
  }

  if (RESERVED_OR_INVALID_TLDS.has(tld)) {
    return {
      valid: false,
      normalizedEmail,
      localPart,
      domain,
      code: 'reserved',
      reason:
        'Test or local domains (.test, .local, .example, .invalid) cannot be used to register.',
    };
  }

  const suggestedDomain = DOMAIN_TYPO_SUGGESTIONS[domain];
  if (suggestedDomain) {
    return {
      valid: false,
      normalizedEmail,
      localPart,
      domain,
      code: 'typo',
      reason: `Did you mean ${localPart}@${suggestedDomain}? Please check your email domain.`,
    };
  }

  if (matchesDomainOrSubdomain(domain, FAKE_PLACEHOLDER_DOMAINS)) {
    return {
      valid: false,
      normalizedEmail,
      localPart,
      domain,
      code: 'fake',
      reason:
        'Placeholder or fake email domains are not allowed. Use a real personal, work, or school email.',
    };
  }

  if (
    matchesDomainOrSubdomain(domain, DISPOSABLE_EMAIL_DOMAINS) ||
    DISPOSABLE_KEYWORD_REGEX.test(domain)
  ) {
    return {
      valid: false,
      normalizedEmail,
      localPart,
      domain,
      code: 'disposable',
      reason:
        'Temporary and disposable email addresses are blocked. Please register with a legitimate email.',
    };
  }

  // Strip +subaddress to inspect base handle for obvious fake strings
  const baseLocal = localPart.split('+')[0];
  const compactLocal = baseLocal.replace(/[^a-z0-9]/g, '');

  if (
    FAKE_LOCAL_PART_EXACT.has(baseLocal) ||
    FAKE_LOCAL_PART_EXACT.has(compactLocal) ||
    /^(.)\1{4,}$/.test(compactLocal)
  ) {
    return {
      valid: false,
      normalizedEmail,
      localPart,
      domain,
      code: 'fake',
      reason:
        'Please enter your real email address rather than a placeholder or dummy address.',
    };
  }

  // Gmail addresses strictly require 6-30 characters (ignoring dots and +tags)
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const gmailCanonical = baseLocal.replace(/\./g, '');
    if (
      gmailCanonical.length < 6 ||
      gmailCanonical.length > 30 ||
      !/^[a-z0-9]+$/.test(gmailCanonical)
    ) {
      return {
        valid: false,
        normalizedEmail,
        localPart,
        domain,
        code: 'fake',
        reason:
          'That does not match a valid Gmail address (Gmail usernames require at least 6 letters or numbers).',
      };
    }
  }

  return {
    valid: true,
    normalizedEmail,
    localPart,
    domain,
  };
}

interface DohAnswer {
  name?: string;
  type?: number;
  data?: string;
}

interface DohResponse {
  Status?: number;
  Answer?: DohAnswer[];
}

async function queryDohMx(
  url: string,
  headers?: Record<string, string>
): Promise<DohResponse | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as DohResponse;
    return json;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function extractMxTargetHost(mxData: string): string {
  // MX data format is "<priority> <host>."
  const parts = mxData.trim().split(/\s+/);
  const rawHost = parts.length >= 2 ? parts[1] : parts[0];
  return rawHost.toLowerCase().replace(/\.$/, '');
}

/**
 * Full registration email legitimacy check:
 * 1. Syntax, reserved TLD, domain typo, fake pattern, and 250+ disposable domain checks.
 * 2. Live DNS-over-HTTPS MX record verification for custom/unrecognized domains
 *    (ensuring the domain exists, has active mail servers, and doesn't route to a disposable MX host).
 */
export async function verifyLegitimateEmailForRegistration(
  rawEmail: string
): Promise<EmailValidationResult> {
  const precheck = validateEmailSyntaxAndReputation(rawEmail);
  if (!precheck.valid) {
    return precheck;
  }

  if (TRUSTED_EMAIL_PROVIDERS.has(precheck.domain)) {
    return precheck;
  }

  const encodedDomain = encodeURIComponent(precheck.domain);
  const doh =
    (await queryDohMx(`https://dns.google/resolve?name=${encodedDomain}&type=MX`)) ??
    (await queryDohMx(
      `https://cloudflare-dns.com/dns-query?name=${encodedDomain}&type=MX`,
      { Accept: 'application/dns-json' }
    ));

  // If offline or DNS endpoints blocked by network policy, keep syntax + blocklist result
  if (!doh || typeof doh.Status !== 'number') {
    return precheck;
  }

  if (doh.Status === 3) {
    return {
      ...precheck,
      valid: false,
      code: 'no_mx',
      reason: `The domain "${precheck.domain}" does not exist. Please register with a real email address.`,
    };
  }

  if (doh.Status === 0) {
    const mxAnswers = (doh.Answer ?? []).filter((ans) => ans.type === 15 && ans.data);
    const activeMxHosts = mxAnswers
      .map((ans) => extractMxTargetHost(ans.data ?? ''))
      .filter((host) => Boolean(host) && host !== '.');

    if (activeMxHosts.length === 0) {
      return {
        ...precheck,
        valid: false,
        code: 'no_mx',
        reason: `The domain "${precheck.domain}" does not have active email servers (MX records). Use a legitimate personal, work, or school email.`,
      };
    }

    const usesDisposableMx = activeMxHosts.some(
      (host) =>
        matchesDomainOrSubdomain(host, DISPOSABLE_EMAIL_DOMAINS) ||
        DISPOSABLE_KEYWORD_REGEX.test(host)
    );

    if (usesDisposableMx) {
      return {
        ...precheck,
        valid: false,
        code: 'disposable_mx',
        reason:
          'This domain routes email through a temporary/disposable mail server and cannot be registered.',
      };
    }
  }

  return precheck;
}
