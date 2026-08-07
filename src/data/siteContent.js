export const navItems = [
  { label: 'About', href: '/#about', sectionId: 'about' },
  { label: 'Focus areas', href: '/#focus', sectionId: 'focus' },
  { label: 'Activities', href: '/#activities', sectionId: 'activities' },
  {
    label: 'Masterminds',
    href: '/masterminds/',
    sectionId: 'masterminds-home',
    activeSections: [
      'masterminds-preview',
      'masterminds-home',
      'advisory',
      'executive',
      'subcommittee',
    ],
    children: [
      {
        label: 'Advisory Panel',
        href: '/masterminds/#advisory',
        sectionId: 'advisory',
      },
      {
        label: 'Executive Committee',
        href: '/masterminds/#executive',
        sectionId: 'executive',
      },
      {
        label: 'Sub-Committee',
        href: '/masterminds/#subcommittee',
        sectionId: 'subcommittee',
      },
    ],
  },
  { label: 'Connect', href: '/#connect', sectionId: 'connect' },
];

export const focusAreas = [
  {
    number: '01',
    title: 'Automation & Control',
    shortTitle: 'Control',
    description:
      'Explore the systems, sensing, and control thinking behind smarter industrial processes.',
    icon: 'workflow',
    tags: ['Control systems', 'Instrumentation'],
  },
  {
    number: '02',
    title: 'Robotics & Intelligent Systems',
    shortTitle: 'Intelligence',
    description:
      'Connect embedded intelligence, robotics, and computation to real-world engineering challenges.',
    icon: 'cpu',
    tags: ['Robotics', 'Embedded intelligence'],
  },
  {
    number: '03',
    title: 'Power Electronics & Energy',
    shortTitle: 'Energy',
    description:
      'Discover how modern power conversion and energy technologies move industry forward.',
    icon: 'zap',
    tags: ['Power conversion', 'Smart energy'],
  },
  {
    number: '04',
    title: 'Connected Industry',
    shortTitle: 'Networks',
    description:
      'Learn how devices, data, and communication come together across connected industrial environments.',
    icon: 'network',
    tags: ['Industrial IoT', 'Communication'],
  },
];

export const chapterValues = [
  {
    number: '01',
    title: 'Our Mission',
    text: 'Create a student-led space to explore industrial electronics through learning, collaboration, and practical engineering.',
    icon: 'target',
  },
  {
    number: '02',
    title: 'Global Network',
    text: 'Connect with peers, mentors, and IEEE communities across a wider global engineering network.',
    icon: 'globe',
  },
  {
    number: '03',
    title: 'Excellence',
    text: 'Develop technical confidence and purposeful work shaped by the standards of modern industry.',
    icon: 'award',
  },
];

export const activityTypes = [
  {
    title: 'Learn',
    kicker: 'Knowledge',
    description:
      'Technical talks, workshops, and guided learning that make complex industrial ideas approachable.',
    icon: 'bookOpen',
    accent: 'blue',
  },
  {
    title: 'Build',
    kicker: 'Practice',
    description:
      'Collaborative projects and hands-on challenges designed to move from theory to working systems.',
    icon: 'circuitBoard',
    accent: 'orange',
  },
  {
    title: 'Connect',
    kicker: 'Community',
    description:
      'A space to meet curious peers, exchange ideas, and grow within the wider IEEE network.',
    icon: 'users',
    accent: 'navy',
  },
];

export const advisoryPanelMembers = [
  {
    id: 'branch-counsellor',
    number: '01',
    role: 'Branch Counselor',
    name: 'Prof. Lasith Yasakethu',
    details: [
      'Senior Academic Treasurer',
      'IEEE Student Branch Chapter of SLTC',
    ],
    image: null,
  },
  {
    id: 'branch-academic-advisor',
    number: '02',
    role: 'Branch Academic Advisor',
    name: 'Mrs. Warunika Hippola',
    details: [
      'Senior Academic Treasurer',
      'IEEE Student Branch Chapter of SLTC',
    ],
    image: null,
  },
  {
    id: 'student-advisor',
    number: '03',
    role: 'Student Advisor',
    cardLabel: 'Student Advisor',
    name: 'Chathila Walgama',
    details: [
      'IEEE Industrial Electronics Society',
      'Student Branch Chapter of SLTC',
    ],
    image: null,
  },
];

export const executiveCommittee = {
  leadership: [
    {
      id: 'chairperson',
      number: '01',
      role: 'Chairperson',
      name: 'Chanula Kalpitha',
      image: null,
    },
    {
      id: 'vice-chairperson',
      number: '02',
      role: 'Vice Chairperson',
      name: 'Dinush Perera',
      image: null,
    },
  ],
  portfolios: [
    {
      id: 'secretariat',
      label: 'Secretary portfolio',
      officer: {
        id: 'secretary',
        number: '03',
        role: 'Secretary',
        name: 'Sethini Thennakoon',
        image: null,
      },
      assistant: {
        id: 'assistant-secretary',
        number: '06',
        role: 'Assistant Secretary',
        supportsRoleId: 'secretary',
        name: 'R.M.H. Hashan Rajapaksha',
        image: null,
      },
    },
    {
      id: 'finance',
      label: 'Treasurer portfolio',
      officer: {
        id: 'treasurer',
        number: '04',
        role: 'Treasurer',
        name: 'Rochana Senarathne',
        image: null,
      },
      assistant: {
        id: 'assistant-treasurer',
        number: '07',
        role: 'Assistant Treasurer',
        supportsRoleId: 'treasurer',
        name: 'Suhara Dewmini',
        image: null,
      },
    },
    {
      id: 'web',
      label: 'Webmaster portfolio',
      officer: {
        id: 'webmaster',
        number: '05',
        role: 'Webmaster',
        name: 'Nadun Manawadu',
        image: null,
      },
      assistant: {
        id: 'assistant-webmaster',
        number: '08',
        role: 'Assistant Webmaster',
        supportsRoleId: 'webmaster',
        name: 'A.A. Chanupa Niduwara',
        image: null,
      },
    },
  ],
};

export const subCommitteeHeads = [
  {
    id: 'membership-development',
    number: '01',
    role: 'Membership Development Sub-Committee Head',
    name: 'Pahan Jayasundara',
    image: null,
  },
  {
    id: 'volunteer-engagement',
    number: '02',
    role: 'Volunteer Engagement Sub-Committee Head',
    name: 'Ushan Ranathunga',
    image: null,
  },
  {
    id: 'editorial',
    number: '03',
    role: 'Editorial Sub-Committee Head',
    name: 'Piyumi Methmini',
    image: null,
  },
  {
    id: 'finance',
    number: '04',
    role: 'Finance Sub-Committee Head',
    name: 'Nadun Sandeepa',
    image: null,
  },
  {
    id: 'program-logistics',
    number: '05',
    role: 'Program & Logistics Sub-Committee Head',
    name: 'Nisal Wijesighe',
    image: null,
  },
  {
    id: 'public-visibility',
    number: '06',
    role: 'Public Visibility Sub-Committee Head',
    name: 'Mohamed Arshad',
    image: null,
  },
  {
    id: 'industry-outreach',
    number: '07',
    role: 'Industry Outreach Sub-Committee Head',
    name: 'Yasas Kasthuriarachchi',
    image: null,
  },
];
