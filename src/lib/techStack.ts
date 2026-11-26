import type { StudentPortfolio } from '../data/portfolios';

export interface TechCatalogEntry {
  name: string;
  category: string;
  accent: string;
  aliases?: string[];
  preset?: boolean;
}

export interface AggregatedTechItem {
  name: string;
  category: string;
  accent: string;
  count: number;
  portfolioIds: string[];
}

export const TECH_CATALOG: TechCatalogEntry[] = [
  {
    name: 'TypeScript',
    category: 'Language',
    accent: '#3178C6',
    aliases: ['ts', 'typescript'],
    preset: true,
  },
  {
    name: 'JavaScript',
    category: 'Language',
    accent: '#F7DF1E',
    aliases: ['js', 'javascript', 'ecmascript', 'es6', 'es2022', 'vanilla js'],
    preset: true,
  },
  {
    name: 'HTML',
    category: 'Markup',
    accent: '#E34F26',
    aliases: ['html', 'html5'],
    preset: true,
  },
  {
    name: 'CSS',
    category: 'Styling',
    accent: '#1572B6',
    aliases: ['css', 'css3'],
    preset: true,
  },
  {
    name: 'CSS Architecture',
    category: 'Styling',
    accent: '#264DE4',
    aliases: ['css architecture'],
  },
  {
    name: 'Tailwind CSS',
    category: 'Styling',
    accent: '#06B6D4',
    aliases: ['tailwind', 'tailwindcss', 'tailwind css'],
    preset: true,
  },
  {
    name: 'Sass / SCSS',
    category: 'Styling',
    accent: '#CC6699',
    aliases: ['sass', 'scss', 'sass / scss'],
  },
  {
    name: 'Bootstrap',
    category: 'Styling',
    accent: '#7952B3',
    aliases: ['bootstrap'],
  },
  {
    name: 'React',
    category: 'Frontend',
    accent: '#0EA5E9',
    aliases: ['react', 'reactjs', 'react.js'],
    preset: true,
  },
  {
    name: 'Next.js',
    category: 'Frontend',
    accent: '#18181B',
    aliases: ['next', 'nextjs', 'next.js'],
    preset: true,
  },
  {
    name: 'Vue',
    category: 'Frontend',
    accent: '#42B883',
    aliases: ['vue', 'vuejs', 'vue.js', 'vue 3'],
    preset: true,
  },
  {
    name: 'Svelte',
    category: 'Frontend',
    accent: '#FF3E00',
    aliases: ['svelte', 'sveltekit'],
  },
  {
    name: 'Angular',
    category: 'Frontend',
    accent: '#DD0031',
    aliases: ['angular', 'angularjs'],
  },
  {
    name: 'Vite',
    category: 'Build Tool',
    accent: '#646CFF',
    aliases: ['vite', 'vitejs'],
  },
  {
    name: 'Three.js',
    category: 'Graphics',
    accent: '#111827',
    aliases: ['three', 'threejs', 'three.js'],
    preset: true,
  },
  {
    name: 'WebGL / GLSL',
    category: 'Graphics',
    accent: '#990000',
    aliases: ['webgl', 'glsl', 'webgl / glsl', 'shaders', 'shader'],
    preset: true,
  },
  {
    name: 'Node.js',
    category: 'Backend',
    accent: '#339933',
    aliases: ['node', 'nodejs', 'node.js'],
    preset: true,
  },
  {
    name: 'Express',
    category: 'Backend',
    accent: '#3F3F46',
    aliases: ['express', 'expressjs', 'express.js'],
  },
  {
    name: 'Python',
    category: 'AI & Data',
    accent: '#3776AB',
    aliases: ['py', 'python', 'python3'],
    preset: true,
  },
  {
    name: 'Django',
    category: 'Backend',
    accent: '#092E20',
    aliases: ['django'],
  },
  {
    name: 'Flask',
    category: 'Backend',
    accent: '#1F2937',
    aliases: ['flask'],
  },
  {
    name: 'FastAPI',
    category: 'Backend',
    accent: '#009688',
    aliases: ['fastapi'],
  },
  {
    name: 'Rust',
    category: 'Systems',
    accent: '#C2410C',
    aliases: ['rust', 'rustlang'],
    preset: true,
  },
  {
    name: 'Go',
    category: 'Backend',
    accent: '#00ADD8',
    aliases: ['go', 'golang'],
    preset: true,
  },
  {
    name: 'Java',
    category: 'Language',
    accent: '#ED8B00',
    aliases: ['java'],
    preset: true,
  },
  {
    name: 'C',
    category: 'Systems',
    accent: '#283593',
    aliases: ['c', 'c lang'],
  },
  {
    name: 'C++',
    category: 'Systems',
    accent: '#00599C',
    aliases: ['c++', 'cpp'],
    preset: true,
  },
  {
    name: 'C#',
    category: 'Language',
    accent: '#512BD4',
    aliases: ['c#', 'csharp', '.net', 'dotnet'],
  },
  {
    name: 'PHP',
    category: 'Backend',
    accent: '#777BB4',
    aliases: ['php'],
  },
  {
    name: 'Laravel',
    category: 'Backend',
    accent: '#FF2D20',
    aliases: ['laravel'],
  },
  {
    name: 'Ruby',
    category: 'Language',
    accent: '#CC342D',
    aliases: ['ruby', 'rails', 'ruby on rails'],
  },
  {
    name: 'Swift',
    category: 'Mobile',
    accent: '#F05138',
    aliases: ['swift', 'swiftui'],
  },
  {
    name: 'Kotlin',
    category: 'Mobile',
    accent: '#7F52FF',
    aliases: ['kotlin'],
  },
  {
    name: 'Dart',
    category: 'Language',
    accent: '#0175C2',
    aliases: ['dart'],
  },
  {
    name: 'Flutter',
    category: 'Mobile',
    accent: '#02569B',
    aliases: ['flutter'],
  },
  {
    name: 'PostgreSQL',
    category: 'Database',
    accent: '#336791',
    aliases: ['postgres', 'postgresql', 'psql'],
    preset: true,
  },
  {
    name: 'MySQL',
    category: 'Database',
    accent: '#4479A1',
    aliases: ['mysql'],
  },
  {
    name: 'SQLite',
    category: 'Database',
    accent: '#0F80CC',
    aliases: ['sqlite', 'sqlite3'],
    preset: true,
  },
  {
    name: 'MongoDB',
    category: 'Database',
    accent: '#47A248',
    aliases: ['mongo', 'mongodb'],
  },
  {
    name: 'Redis',
    category: 'Database',
    accent: '#DC382D',
    aliases: ['redis'],
  },
  {
    name: 'Supabase',
    category: 'Database',
    accent: '#3ECF8E',
    aliases: ['supabase'],
    preset: true,
  },
  {
    name: 'Firebase',
    category: 'Backend',
    accent: '#FFCA28',
    aliases: ['firebase', 'firestore'],
  },
  {
    name: 'GraphQL',
    category: 'API',
    accent: '#E10098',
    aliases: ['graphql', 'gql'],
  },
  {
    name: 'WebAssembly',
    category: 'Runtime',
    accent: '#654FF0',
    aliases: ['wasm', 'webassembly', 'web assembly'],
    preset: true,
  },
  {
    name: 'LLVM',
    category: 'Compiler',
    accent: '#262D3A',
    aliases: ['llvm'],
  },
  {
    name: 'Docker',
    category: 'Infrastructure',
    accent: '#2496ED',
    aliases: ['docker', 'dockerfile'],
    preset: true,
  },
  {
    name: 'Kubernetes',
    category: 'Infrastructure',
    accent: '#326CE5',
    aliases: ['kubernetes', 'k8s'],
  },
  {
    name: 'Git',
    category: 'Tooling',
    accent: '#F05032',
    aliases: ['git'],
  },
  {
    name: 'GitHub',
    category: 'Tooling',
    accent: '#24292F',
    aliases: ['github', 'github pages'],
  },
  {
    name: 'TensorFlow.js',
    category: 'AI & Data',
    accent: '#FF6F00',
    aliases: ['tensorflow', 'tensorflow.js', 'tfjs'],
  },
  {
    name: 'PyTorch',
    category: 'AI & Data',
    accent: '#EE4C2C',
    aliases: ['pytorch', 'torch'],
  },
  {
    name: 'Figma',
    category: 'UI / Design',
    accent: '#A259FF',
    aliases: ['figma'],
  },
];

const ALIAS_TO_ENTRY = new Map<string, TechCatalogEntry>();
for (const entry of TECH_CATALOG) {
  ALIAS_TO_ENTRY.set(entry.name.toLowerCase(), entry);
  for (const alias of entry.aliases ?? []) {
    ALIAS_TO_ENTRY.set(alias.toLowerCase(), entry);
  }
}

export const TECH_SKILL_PRESETS = TECH_CATALOG.filter((entry) => entry.preset);

export function canonicalizeSkillName(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const match = ALIAS_TO_ENTRY.get(cleaned.toLowerCase());
  return match ? match.name : cleaned;
}

export function getTechMetadata(name: string): {
  name: string;
  category: string;
  accent: string;
} {
  const canonical = canonicalizeSkillName(name);
  const match = ALIAS_TO_ENTRY.get(canonical.toLowerCase());
  if (match) {
    return {
      name: match.name,
      category: match.category,
      accent: match.accent,
    };
  }

  let hash = 0;
  for (let i = 0; i < canonical.length; i += 1) {
    hash = (hash * 31 + canonical.charCodeAt(i)) >>> 0;
  }
  const palette = ['#2563EB', '#0F766E', '#EA4C89', '#7C3AED', '#D97706', '#0284C7'];
  return {
    name: canonical,
    category: 'Technology',
    accent: palette[hash % palette.length],
  };
}

export function portfolioMatchesSkill(
  portfolioSkills: string[],
  targetSkill: string
): boolean {
  const canonicalTarget = canonicalizeSkillName(targetSkill).toLowerCase();
  if (!canonicalTarget) return true;
  return portfolioSkills.some(
    (skill) => canonicalizeSkillName(skill).toLowerCase() === canonicalTarget
  );
}

export function aggregateTechStack(
  portfolios: StudentPortfolio[]
): AggregatedTechItem[] {
  const buckets = new Map<string, AggregatedTechItem>();

  for (const portfolio of portfolios) {
    const seenInPortfolio = new Set<string>();
    for (const rawSkill of portfolio.skills) {
      const canonical = canonicalizeSkillName(rawSkill);
      if (!canonical) continue;
      const key = canonical.toLowerCase();
      if (seenInPortfolio.has(key)) continue;
      seenInPortfolio.add(key);

      const existing = buckets.get(key);
      if (existing) {
        existing.count += 1;
        existing.portfolioIds.push(portfolio.id);
      } else {
        const meta = getTechMetadata(canonical);
        buckets.set(key, {
          name: meta.name,
          category: meta.category,
          accent: meta.accent,
          count: 1,
          portfolioIds: [portfolio.id],
        });
      }
    }
  }

  return Array.from(buckets.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });
}

export function detectTechFromUploadedFiles(
  files: { path: string; textContent?: string }[]
): string[] {
  const detected: string[] = [];
  const add = (tech: string) => {
    const canonical = canonicalizeSkillName(tech);
    if (canonical && !detected.includes(canonical)) {
      detected.push(canonical);
    }
  };

  let combinedText = '';
  for (const file of files) {
    const lowerPath = file.path.toLowerCase();
    const ext = lowerPath.split('.').pop() || '';
    if (ext === 'html' || ext === 'htm') add('HTML');
    if (ext === 'css') add('CSS');
    if (ext === 'scss' || ext === 'sass') add('Sass / SCSS');
    if (ext === 'js' || ext === 'mjs' || ext === 'cjs') add('JavaScript');
    if (ext === 'ts' || ext === 'tsx') add('TypeScript');
    if (ext === 'jsx' || ext === 'tsx') add('React');
    if (ext === 'vue') add('Vue');
    if (ext === 'svelte') add('Svelte');
    if (ext === 'wasm') add('WebAssembly');
    if (ext === 'glsl' || ext === 'frag' || ext === 'vert') add('WebGL / GLSL');
    if (ext === 'py') add('Python');

    if (file.textContent && combinedText.length < 250000) {
      combinedText += `\n${file.textContent.slice(0, 60000)}`;
    }
  }

  if (combinedText) {
    if (/<style[\s>]/i.test(combinedText)) add('CSS');
    if (/<script[\s>]/i.test(combinedText)) add('JavaScript');
    if (/tailwindcss|cdn\.tailwindcss\.com/i.test(combinedText)) add('Tailwind CSS');
    if (/bootstrap(\.min)?\.css|cdn\.jsdelivr\.net\/npm\/bootstrap/i.test(combinedText)) {
      add('Bootstrap');
    }
    if (/react(\.production|\.development|dom)|react-dom/i.test(combinedText)) add('React');
    if (/vue(\.global|\.runtime)?(\.prod)?\.js|createApp\(/i.test(combinedText)) add('Vue');
    if (/three(\.min|\.module)?\.js|THREE\./i.test(combinedText)) add('Three.js');
    if (/getContext\(['"]webgl|gl_FragColor/i.test(combinedText)) add('WebGL / GLSL');
  }

  return detected.slice(0, 8);
}
