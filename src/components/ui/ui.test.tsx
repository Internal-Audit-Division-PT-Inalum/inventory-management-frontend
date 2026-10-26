import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge, Button, Card, CardTitle, Input, Skeleton } from "./index";

describe("UI Primitives Component Tests", () => {
	it("renders button with mobile touch target", () => {
		render(<Button size="touch">Ambil Barang</Button>);
		const btn = screen.getByRole("button", { name: "Ambil Barang" });
		expect(btn).toBeDefined();
		expect(btn.className).toContain("min-h-[44px]");
	});

	it("renders stock health badges accurately", () => {
		render(
			<div>
				<Badge variant="ok">Aman</Badge>
				<Badge variant="warning">Rendah</Badge>
				<Badge variant="critical">Kritis</Badge>
				<Badge variant="info">Dipinjam</Badge>
			</div>,
		);
		expect(screen.getByText("Aman").className).toContain("bg-emerald-50");
		expect(screen.getByText("Rendah").className).toContain("bg-amber-50");
		expect(screen.getByText("Kritis").className).toContain("bg-red-50");
		expect(screen.getByText("Dipinjam").className).toContain("bg-blue-50");
	});

	it("renders input with validation error states", () => {
		render(<Input placeholder="Jumlah unit" error aria-label="Jumlah" />);
		const input = screen.getByLabelText("Jumlah");
		expect(input.className).toContain("border-red-500");
		expect(input.className).toContain("min-h-[44px]");
	});

	it("renders card and skeleton loading primitives", () => {
		render(
			<Card>
				<CardTitle>Lemari ATK</CardTitle>
				<Skeleton data-testid="loader" className="h-6 w-24" />
			</Card>,
		);
		expect(screen.getByText("Lemari ATK")).toBeDefined();
		expect(screen.getByTestId("loader").className).toContain("animate-pulse");
	});
});
