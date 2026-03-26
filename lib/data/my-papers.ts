export type PaperRole = "1st" | "corresponding" | "co-author"
export type ArticleType = "Original" | "Review" | "Case Report" | "Meta-analysis" | "RCT" | "Video" | "Technical Note"

export interface MyPaper {
  id: number
  title: string
  journal: string
  year: number
  role: PaperRole
  type: ArticleType
  doi?: string
}

export const SCHOLAR_LINKS = {
  googleScholar: "https://scholar.google.com/citations?hl=ko&user=tbTBemUAAAAJ",
  researchGate: "https://www.researchgate.net/profile/Woon-Tak-Yuh?ev=hdr_xprf",
}

export const MY_PAPERS: MyPaper[] = [
  // 1st Author (14)
  { id: 1, title: "Primary Spinal Cord Oligodendroglioma: A Multi-institutional Study", journal: "KJS", year: 2015, role: "1st", type: "Original" },
  { id: 2, title: "Surgical Outcome of Adult Idiopathic Chiari Malformation Type 1", journal: "JKNS", year: 2016, role: "1st", type: "Original" },
  { id: 3, title: "Spinal Cord Subependymoma Surgery: Multi-Institutional Experience", journal: "JKNS", year: 2018, role: "1st", type: "Original" },
  { id: 4, title: "Nationwide Results of COVID-19 Contact Tracing in South Korea", journal: "JMIR Med Inform", year: 2020, role: "1st", type: "Original" },
  { id: 5, title: "Narrative Review of Uniportal, Transforaminal Endoscopic Lumbar Discectomy", journal: "Int J Pain", year: 2022, role: "1st", type: "Review" },
  { id: 6, title: "Microsurgical Resection of a Spinal Cord Hemangioblastoma", journal: "ONS", year: 2022, role: "1st", type: "Video" },
  { id: 7, title: "Nationwide Sample Data: Additional Surgery Rate After Cervical Surgery", journal: "Sci Rep", year: 2023, role: "1st", type: "Original" },
  { id: 8, title: "Optimal Time Between Embolization and Surgery for Spinal Metastatic Tumors", journal: "JKNS", year: 2023, role: "1st", type: "Meta-analysis" },
  { id: 9, title: "Future of Endoscopic Spine Surgery: Insights from Cutting-Edge Technology", journal: "Bioengineering", year: 2023, role: "1st", type: "Review" },
  { id: 10, title: "ERAS Protocol: Primary Spinal Tumors vs Degenerative Diseases", journal: "JNS Spine", year: 2023, role: "1st", type: "Original" },
  { id: 11, title: "Deep Learning-Assisted Quantitative Measurement of Thoracolumbar Fracture", journal: "Neurospine", year: 2024, role: "1st", type: "Original" },
  { id: 12, title: "Trends in Degenerative Lumbar Spinal Surgery During COVID-19 Pandemic", journal: "PLOS One", year: 2024, role: "1st", type: "Original" },
  { id: 14, title: "Intraoperative Injection of Indigo Carmine During UBE Surgery", journal: "JMISST", year: 2025, role: "1st", type: "Technical Note" },
  { id: 15, title: "UBE Removal of Cervical Extradural Schwannoma at C1-2 Level", journal: "JMISST", year: 2026, role: "1st", type: "Case Report" },
  // Corresponding only (1)
  { id: 13, title: "Potential Pharmacologic Treatments in SCI: Narrative Review", journal: "KJNT", year: 2025, role: "corresponding", type: "Review" },
  // Co-Author (14)
  { id: 16, title: "Interlaminar Endoscopic Lumbar Discectomy: Narrative Review", journal: "IJSS", year: 2021, role: "co-author", type: "Review" },
  { id: 17, title: "Mechanical Failure After Total En Bloc Spondylectomy", journal: "Neurospine", year: 2022, role: "co-author", type: "Original" },
  { id: 18, title: "Validity of MRI in Primary Spinal Cord Tumors", journal: "Sci Rep", year: 2022, role: "co-author", type: "Original" },
  { id: 19, title: "Factors Associated With Perioperative HAPI in Spine Surgery", journal: "JNA", year: 2022, role: "co-author", type: "Original" },
  { id: 20, title: "Genetic Odyssey to OPLL in Cervical Spine: Systematic Review", journal: "Neurospine", year: 2022, role: "co-author", type: "Review" },
  { id: 21, title: "Cost-Utility Analysis: Decompression vs Fusion for Elderly Lumbar Stenosis", journal: "Sci Rep", year: 2022, role: "co-author", type: "Original" },
  { id: 22, title: "Is Laminectomy Necessary for C1-C2 Epidural Schwannomas?", journal: "Acta Neurochir", year: 2023, role: "co-author", type: "Original" },
  { id: 23, title: "Impact of C3 Laminectomy on Cervical Sagittal Alignment in Laminoplasty: RCT", journal: "TSJ", year: 2023, role: "co-author", type: "RCT" },
  { id: 24, title: "OLIF+PSF: Double Position vs Navigation-Assisted Single Lateral", journal: "PLOS One", year: 2023, role: "co-author", type: "Original" },
  { id: 25, title: "Multi-Pose CNN Model for Central Lumbar Spinal Stenosis", journal: "Sci Rep", year: 2024, role: "co-author", type: "Original" },
  { id: 26, title: "Deep Learning for Landmark Identification in Whole-Spine Radiographs", journal: "Bioengineering", year: 2024, role: "co-author", type: "Original" },
  { id: 27, title: "Spinal Schwannoma Classification Based on Presumed Origin", journal: "Neurospine", year: 2024, role: "co-author", type: "Original" },
  { id: 28, title: "Comparative Efficacy of AP/Lateral X-ray Based DL for OVF Detection", journal: "Sci Rep", year: 2024, role: "co-author", type: "Original" },
  { id: 29, title: "Augmented Prediction of Vertebral Collapse After OVF via Foundation Models", journal: "Sci Rep", year: 2024, role: "co-author", type: "Original" },
]
