import type { MilestoneDraft } from "./types";

export const DEMO_BRIEF = `I run Bloom & Rye, a small neighbourhood bakery. I need a one-page website so locals can find our opening hours, see the menu with prices, and send us messages about custom cake orders. It must work well on phones. Our brand green is #2f6b4f. Later I'd like a simple way for people to order for pickup.`;

export const DEMO_MILESTONES: MilestoneDraft[] = [
  {
    title: "Responsive landing page",
    summary: "A live one-page site with hours, contact form and brand styling.",
    amount: 240,
    criteria: [
      { id: "c1", text: "The page title and main heading name the bakery “Bloom & Rye”.", weight: 3, check: "page" },
      { id: "c2", text: "Opening hours are listed for all seven days of the week.", weight: 3, check: "page" },
      { id: "c3", text: "A contact form has name, email and message fields, and all three are required.", weight: 4, check: "page" },
      { id: "c4", text: "The page has a viewport meta tag and at least one responsive @media rule.", weight: 3, check: "page" },
      { id: "c5", text: "Every image has descriptive alt text.", weight: 2, check: "page" },
      { id: "c6", text: "Primary call-to-action buttons use the brand green #2f6b4f.", weight: 2, check: "page" },
    ],
  },
  {
    title: "Menu and pickup ordering",
    summary: "A priced menu section and a clear path to order for pickup.",
    amount: 160,
    criteria: [
      { id: "c1", text: "The menu lists at least 8 items, each with a price.", weight: 4, check: "page" },
      { id: "c2", text: "An “Order for pickup” button links to an ordering page or form.", weight: 3, check: "page" },
      { id: "c3", text: "The freelancer provides a handover note explaining how to change menu prices.", weight: 2, check: "text" },
    ],
  },
];
