"use client";

// Shown only if the page's own layout fails, so it can't use the app's
// shell or styles: plain, readable, and with a way out.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "18vh 24px 0", color: "#171717", background: "#ffffff" }}>
        <h1 style={{ fontSize: 26, margin: "0 0 10px" }}>Something went wrong</h1>
        <p style={{ fontSize: 16, lineHeight: 1.5, maxWidth: 440, margin: "0 auto 28px", color: "#444444" }}>
          Please reload the page. If the problem stays, tell your teacher or school administrator.
        </p>
        <button
          onClick={() => reset()}
          style={{ background: "#c2410c", color: "#ffffff", border: 0, borderRadius: 999, fontWeight: 700, fontSize: 16, padding: "12px 32px", cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
