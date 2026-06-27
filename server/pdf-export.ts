export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 794, height: 1123 }
    });

    await context.route("**/*", (route) => {
      const url = route.request().url();

      if (url.startsWith("about:") || url.startsWith("data:")) {
        route.continue();
        return;
      }

      route.abort();
    });

    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 10_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "16mm",
        right: "14mm",
        bottom: "16mm",
        left: "14mm"
      }
    });

    await context.close();
    return pdf;
  } finally {
    await browser.close();
  }
}
