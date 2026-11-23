// src/lib/tools.js
// Every tool that is built and working. The hub, the sidebar and the search all read this list.
// Add a tool here only when its page works end to end.

export const toolGroups = [
  { id: "photo", label: "Photo studio", bangla: "ফটো স্টুডিও" },
  { id: "job", label: "Job application", bangla: "চাকরির আবেদন" },
  { id: "documents", label: "Deeds & documents", bangla: "দলিল ও চুক্তিপত্র" },
];

/** icon = a lucide-react icon name, resolved in components/shell/tool-icon.jsx */
export const tools = [
  {
    slug: "auto-passport",
    group: "photo",
    name: "Auto passport photo",
    bangla: "অটো পাসপোর্ট ছবি",
    description: "Drop the photo — face centred, background removed, light fixed, ready on the page. Just press Print.",
    icon: "Wand2",
    keywords: "auto passport photo background remove white blue studio one click print ব্যাকগ্রাউন্ড পাসপোর্ট অটো",
  },
  {
    slug: "photo-sheet",
    group: "photo",
    name: "Passport photo sheet",
    bangla: "পাসপোর্ট / স্ট্যাম্প ছবি",
    description: "Crop passport, stamp, visa or custom-size photos and print many copies — several people on one page.",
    icon: "LayoutGrid",
    keywords: "passport stamp visa photo print copies sheet 4r a4 পাসপোর্ট স্ট্যাম্প ছবি",
  },
  {
    slug: "joint-photo",
    group: "photo",
    name: "Joint photo",
    bangla: "যৌথ ছবি",
    description: "Join 2 to 4 people in one photo on one clean background — faces lined up to the same size automatically.",
    icon: "Users",
    keywords: "joint couple two people marriage bank যৌথ",
  },
  {
    slug: "id-card-print",
    group: "photo",
    name: "NID / ID card print",
    bangla: "এনআইডি কার্ড প্রিন্ট",
    description: "Phone photo or scan of the customer's card — straightened, cut to real card size, front and back on A4.",
    icon: "IdCard",
    keywords: "nid national id card smart card front back print copy laminate এনআইডি",
  },
  {
    slug: "remove-bg",
    group: "photo",
    name: "Remove background",
    bangla: "ব্যাকগ্রাউন্ড মুছুন",
    description: "Cut people out of any photo — transparent PNG or a new background colour. Many photos at once.",
    icon: "Eraser",
    keywords: "remove background bg erase transparent png cut out ব্যাকগ্রাউন্ড মুছুন",
  },
  {
    slug: "cv-maker",
    group: "job",
    name: "CV maker",
    bangla: "সিভি / রিজিউম তৈরি",
    description:
      "Fill in the form — a neat 2-page CV with photo, every row lined up. Print in colour, save as PDF or Word, keep it for next time.",
    icon: "FileUser",
    keywords: "cv resume biodata job application word docx print bio data সিভি রিজিউম বায়োডাটা জীবনবৃত্তান্ত",
  },
  {
    slug: "deed-writer",
    group: "documents",
    name: "Deed writer",
    bangla: "দলিল / চুক্তিপত্র লেখা",
    description: "Pick a deed, fill in the people and details in Bangla, press Print — it lands below the stamp on each sheet.",
    icon: "ScrollText",
    keywords:
      "deed agreement stamp chuktipotro dolil rent office shop loan hawladnama auto rickshaw sale দলিল চুক্তিপত্র হাওলাদনামা ভাড়া বিক্রয় স্ট্যাম্প",
  },
];

export function getTool(slug) {
  return tools.find((t) => t.slug === slug);
}