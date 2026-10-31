import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DepthStamp, FigureCaption, HudBar, NumberedCallout, PartsList, PhasePath, SpecLabel, StatusLabel } from ".";

describe("brand components", () => {
  it("FigureCaption bolds the subject", () => {
    const { container } = render(<FigureCaption parts={["FIG. 0", "ONE PATH", "7 PHASES"]} />);
    expect(container.querySelector("b")?.textContent).toBe("ONE PATH");
    expect(container.textContent).toContain("FIG. 0·ONE PATH·7 PHASES");
  });

  it("NumberedCallout pads numbers", () => {
    render(<NumberedCallout n={3} accent />);
    expect(screen.getByText("03").className).toContain("fm-num--accent");
  });

  it("PartsList renders caption and rows", () => {
    render(<PartsList caption="Parts list · Curriculum" head={["No.", "Phase"]} rows={[{ cells: ["1", "Foundations"] }]} />);
    expect(screen.getByText("Parts list · Curriculum")).toBeTruthy();
    expect(screen.getByText("Foundations")).toBeTruthy();
  });

  it("SpecLabel prints code, parts and note", () => {
    const { container } = render(<SpecLabel code="S-03" parts={["Load balancer"]} note="Live" />);
    expect(container.textContent).toBe("S-03Load balancerLive");
  });

  it("HudBar is a status region with live text", () => {
    render(<HudBar live="Week 07 · Caching" items={[{ k: "QPS", v: "12,400" }]} right="§3.2" />);
    expect(screen.getByRole("status").textContent).toContain("QPS12,400");
  });

  it("DepthStamp prints the word, not only color", () => {
    render(<DepthStamp depth="tradeoffs" />);
    expect(screen.getByText("Tradeoffs")).toBeTruthy();
  });

  it("StatusLabel pairs glyph and word", () => {
    const { container } = render(<StatusLabel status="over" detail="ρ .99" />);
    expect(container.textContent).toBe("■Overloaded · ρ .99");
  });

  it("PhasePath draws 7 steps with focusable callouts and marks the active one", () => {
    const { container } = render(<PhasePath active={3} />);
    expect(container.querySelectorAll(".step")).toHaveLength(7);
    expect(container.querySelectorAll('.co[tabindex="0"]')).toHaveLength(7);
    expect(container.querySelector(".co.is-on")?.getAttribute("aria-label")).toMatch(/^Phase 3/);
  });

  it("PhasePath can render static, without labels", () => {
    const { container } = render(<PhasePath interactive={false} labels={false} />);
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(0);
    expect(container.querySelectorAll(".lbl")).toHaveLength(0);
  });
});
