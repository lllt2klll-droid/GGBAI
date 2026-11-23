export type GradeLevel = "primary" | "lower_secondary" | "upper_secondary";

export type Project = {
  id: string;
  title: string;
  description?: string;
  gradeLevel?: GradeLevel;
  topic?: string;
  currentVersionId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ConstructionVersion = {
  id: string;
  projectId: string;
  versionNumber: number;
  schemaVersion: string;
  geometryIr: unknown;
  changeSummary?: string;
  createdBy: "user" | "ai" | "system";
  createdAt: string;
};
