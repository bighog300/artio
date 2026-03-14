import * as React from "react";
export function EmailLayout({
  preview,
  children,
  unsubscribeUrl,
}: {
  preview: string;
  children: React.ReactNode;
  unsubscribeUrl?: string;
}) {
  return (
    <html lang="en">
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta charSet="utf-8" />
        <meta name="x-preview-text" content={preview} />
      </head>
      <body style={{ margin: 0, backgroundColor: "#f9fafb", fontFamily: "Arial, sans-serif" }}>
        <table width="100%" cellPadding={0} cellSpacing={0} role="presentation" style={{ backgroundColor: "#f9fafb" }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "24px 0" }}>
                <table width="600" cellPadding={0} cellSpacing={0} role="presentation" style={{ width: "600px", maxWidth: "600px", backgroundColor: "#ffffff" }}>
                  <tbody>
                    <tr>
                      <td style={{ backgroundColor: "#1A1A2E", padding: "20px 24px", color: "#ffffff", fontSize: "22px", fontWeight: "bold" }}>
                        Artio
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "32px 24px" }}>{children}</td>
                    </tr>
                    <tr>
                      <td style={{ borderTop: "1px solid #e5e7eb", padding: "16px 24px", color: "#9ca3af", fontSize: "12px" }}>
                        <p style={{ margin: 0 }}>Artio · 123 Example Street, London, UK</p>
                        {unsubscribeUrl ? (
                          <p style={{ margin: "8px 0 0" }}>
                            <a href={unsubscribeUrl} style={{ color: "#9ca3af" }}>
                              Unsubscribe
                            </a>
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
