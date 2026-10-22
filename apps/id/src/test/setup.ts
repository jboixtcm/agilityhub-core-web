import "@testing-library/jest-dom/vitest";
import { installWebLocks } from "@agilityhub/auth/testing";
import { configure } from "@testing-library/react";

configure({ asyncUtilTimeout: 10_000 });

// R-01-06's refresh lock as the supported browsers run it (E11-W05, E160 #2).
installWebLocks();
