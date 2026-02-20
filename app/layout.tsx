import type { Metadata } from 'next';
import '../src/app/globals.css';

export const metadata: Metadata = {
    title: 'Dexter Support AI',
    description: 'Powered by Llama 3 & Pinecone',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
