import type { NextApiRequest, NextApiResponse } from "next";

type Data = {
  success: boolean;
  count?: number;
  error?: string;
};

interface Project {
  id: string | undefined;
  events: string[];
}

interface Params {
  start: string;
  end: string;
  filterTests: boolean;
}

const BASE_URL = "https://app.posthog.com/api/projects";
const ALLOWED_EVENTS = new Set([
  "World ID verification success",
  "WLD airdrop block claimed",
  "Airdrop level reward claimed",
  "wid verification success",
  // More verification events here...
]);

let headers = new Headers();
headers.append("Authorization", `Bearer ${process.env.POSTHOG_PRIVATE_KEY!}`);
headers.append("Content-Type", "application/json");

const countEvents = async (id: string, events: string[], params: Params) => {
  const allEvents = events.map((event) => {
    if (ALLOWED_EVENTS.has(event)) {
      return { id: event };
    } else {
      throw new Error(`Given event is not allowed: ${event}`);
    }
  });

  const options: RequestInit = {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      events: allEvents,
      date_from: params.start,
      date_to: params.end,
      filter_test_accounts: params.filterTests,
    }),
  };

  return fetch(`${BASE_URL}/${id}/insights/trend`, options)
    .then((response) => {
      return response.json();
    })
    .catch((error) => {
      console.log("error", error);
    });
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const params: Params = {
    start: req.body.start || "2022-01-01",
    end: req.body.end || new Date().toISOString(),
    filterTests: req.body.filter_tests || false,
  };

  const appEvents = req.body.app_events;
  const idEvents = req.body.id_events;

  const projects: Project[] = [
    {
      id: process.env.WORLD_APP_PROJECT_ID,
      events: appEvents,
    },
    {
      id: process.env.WORLD_ID_PROJECT_ID,
      events: idEvents,
    },
  ];

  return Promise.all(
    projects.map((project) => {
      if (project.id) {
        return countEvents(project.id, project.events, params);
      }
    })
  )
    .then((data) => {
      // Count total events across projects
      const total = data.reduce((acc, curr) => {
        // Count total events across event types
        const count = curr.result.reduce(
          (a: any, b: { count: number }) => a + b.count,
          0
        );
        return acc + count;
      }, 0);

      console.log(`POST /api/verifications  ${req.headers["user-agent"]}`);

      res.status(200).json({ success: true, count: total });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({ success: false, error: error });
    });
}
