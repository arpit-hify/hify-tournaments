import './globals.css';

export const metadata = {
  title: 'HiFy Tournaments',
  description: 'Create and manage tournaments',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
