export interface CanonicalChapter {
  id: string;
  name: string;
  class: 11 | 12;
  order: number; // 1 to 19 for Class 11, 20 to 32 for Class 12
  subject: string;
}

export const CANONICAL_CHAPTERS: CanonicalChapter[] = [
  // Class 11 Biology (Chapters 1 to 19)
  { id: 'c11-the-living-world', name: 'The Living World', class: 11, order: 1, subject: 'Biology' },
  { id: 'c11-biological-classification', name: 'Biological Classification', class: 11, order: 2, subject: 'Biology' },
  { id: 'c11-plant-kingdom', name: 'Plant Kingdom', class: 11, order: 3, subject: 'Biology' },
  { id: 'c11-animal-kingdom', name: 'Animal Kingdom', class: 11, order: 4, subject: 'Biology' },
  { id: 'c11-morphology-of-flowering-plants', name: 'Morphology of Flowering Plants', class: 11, order: 5, subject: 'Biology' },
  { id: 'c11-anatomy-of-flowering-plants', name: 'Anatomy of Flowering Plants', class: 11, order: 6, subject: 'Biology' },
  { id: 'c11-structural-organisation-in-animals', name: 'Structural Organisation in Animals', class: 11, order: 7, subject: 'Biology' },
  { id: 'c11-cell-the-unit-of-life', name: 'Cell: The Unit of Life', class: 11, order: 8, subject: 'Biology' },
  { id: 'c11-biomolecules', name: 'Biomolecules', class: 11, order: 9, subject: 'Biology' },
  { id: 'c11-cell-cycle-and-cell-division', name: 'Cell Cycle and Cell Division', class: 11, order: 10, subject: 'Biology' },
  { id: 'c11-photosynthesis-in-higher-plants', name: 'Photosynthesis in Higher Plants', class: 11, order: 11, subject: 'Biology' },
  { id: 'c11-respiration-in-plants', name: 'Respiration in Plants', class: 11, order: 12, subject: 'Biology' },
  { id: 'c11-plant-growth-and-development', name: 'Plant Growth and Development', class: 11, order: 13, subject: 'Biology' },
  { id: 'c11-breathing-and-exchange-of-gases', name: 'Breathing and Exchange of Gases', class: 11, order: 14, subject: 'Biology' },
  { id: 'c11-body-fluids-and-circulation', name: 'Body Fluids and Circulation', class: 11, order: 15, subject: 'Biology' },
  { id: 'c11-excretory-products-and-their-elimination', name: 'Excretory Products and their Elimination', class: 11, order: 16, subject: 'Biology' },
  { id: 'c11-locomotion-and-movement', name: 'Locomotion and Movement', class: 11, order: 17, subject: 'Biology' },
  { id: 'c11-neural-control-and-coordination', name: 'Neural Control and Coordination', class: 11, order: 18, subject: 'Biology' },
  { id: 'c11-chemical-coordination-and-integration', name: 'Chemical Coordination and Integration', class: 11, order: 19, subject: 'Biology' },

  // Class 12 Biology (Chapters 20 to 32)
  { id: 'c12-sexual-reproduction-in-flowering-plants', name: 'Sexual Reproduction in Flowering Plants', class: 12, order: 20, subject: 'Biology' },
  { id: 'c12-human-reproduction', name: 'Human Reproduction', class: 12, order: 21, subject: 'Biology' },
  { id: 'c12-reproductive-health', name: 'Reproductive Health', class: 12, order: 22, subject: 'Biology' },
  { id: 'c12-principles-of-inheritance-and-variation', name: 'Principles of Inheritance and Variation', class: 12, order: 23, subject: 'Biology' },
  { id: 'c12-molecular-basis-of-inheritance', name: 'Molecular Basis of Inheritance', class: 12, order: 24, subject: 'Biology' },
  { id: 'c12-evolution', name: 'Evolution', class: 12, order: 25, subject: 'Biology' },
  { id: 'c12-human-health-and-disease', name: 'Human Health and Disease', class: 12, order: 26, subject: 'Biology' },
  { id: 'c12-microbes-in-human-welfare', name: 'Microbes in Human Welfare', class: 12, order: 27, subject: 'Biology' },
  { id: 'c12-biotechnology-principles-and-processes', name: 'Biotechnology: Principles and Processes', class: 12, order: 28, subject: 'Biology' },
  { id: 'c12-biotechnology-and-its-applications', name: 'Biotechnology and its Applications', class: 12, order: 29, subject: 'Biology' },
  { id: 'c12-organisms-and-populations', name: 'Organisms and Populations', class: 12, order: 30, subject: 'Biology' },
  { id: 'c12-ecosystem', name: 'Ecosystem', class: 12, order: 31, subject: 'Biology' },
  { id: 'c12-biodiversity-and-conservation', name: 'Biodiversity and Conservation', class: 12, order: 32, subject: 'Biology' },
];

export const CANONICAL_CHAPTER_NAMES = CANONICAL_CHAPTERS.map(c => c.name);

export function findCanonicalChapter(name: string, targetClass?: 11 | 12): CanonicalChapter | undefined {
  const normalized = name.trim().toLowerCase();
  return CANONICAL_CHAPTERS.find(c => {
    const matchesName = c.name.toLowerCase() === normalized;
    if (targetClass) {
      return matchesName && c.class === targetClass;
    }
    return matchesName;
  });
}
