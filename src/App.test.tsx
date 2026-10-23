import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "@/App";

describe("App Root Component Smoke Test", () => {
	it("renders the inventory system header with Inalum brand", () => {
		render(<App />);
		expect(screen.getByText("INVENTORY SYSTEM")).toBeDefined();
		expect(screen.getByText("Internal Audit PT INALUM")).toBeDefined();
		expect(screen.getByText("Online")).toBeDefined();
	});

	it("renders the foundation status card", () => {
		render(<App />);
		expect(screen.getByText("PWA Mobile Inventory Foundation")).toBeDefined();
		expect(screen.getByText("Inisialisasi Fondasi")).toBeDefined();
	});
});
