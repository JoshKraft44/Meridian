import { defineRailway, github, project, service } from "railway/iac";

// Only manages the Meridian service. Postgres and variables stay in the Railway dashboard.
export const partial = "Meridian";

export default defineRailway(() => {
  const Meridian = service("Meridian", {
    source: github("JoshKraft44/Meridian", { branch: "master", checkSuites: false }),
    build: { buildCommand: "npx prisma generate && npm run build", builder: "NIXPACKS" },
    preDeploy: "npx prisma db push",
    start: "node build",
    replicas: { "us-east4-eqdc4a": 1 },
    networking: { privateNetworkEndpoint: "meridian" },
  });

  return project("superb-mercy", {
    variables: { managed: false },
    resources: [Meridian],
  });
});
