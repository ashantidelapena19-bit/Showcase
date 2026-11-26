import React from 'react';
import { canonicalizeSkillName, getTechMetadata } from '../lib/techStack';

interface TechLogoProps {
  name: string;
  size?: number;
  className?: string;
}

function getFallbackMonogram(name: string): string {
  const clean = name.trim();
  if (!clean) return '</>';
  const parts = clean.split(/[\s/.-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export const TechLogo: React.FC<TechLogoProps> = ({
  name,
  size = 24,
  className = '',
}) => {
  const canonical = canonicalizeSkillName(name);
  const meta = getTechMetadata(canonical);

  const renderGraphic = (): React.ReactNode => {
    switch (canonical) {
      case 'TypeScript':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="6" fill="#3178C6" />
            <path
              d="M9.5 16.5H17V18.8H14.5V26H11.9V18.8H9.5V16.5ZM18.4 24.4C19.2 25.1 20.5 25.6 21.8 25.6C23.4 25.6 24.4 24.8 24.4 23.6C24.4 22.6 23.7 22 22 21.4L20.9 21C19 20.3 18 19.3 18 17.6C18 15.6 19.7 14.3 22.1 14.3C23.6 14.3 24.8 14.7 25.6 15.3L24.5 17.3C23.8 16.8 23 16.5 22.1 16.5C21 16.5 20.4 17 20.4 17.7C20.4 18.4 21 18.9 22.4 19.4L23.5 19.8C25.6 20.6 26.8 21.7 26.8 23.6C26.8 25.9 24.9 27.6 21.9 27.6C20.1 27.6 18.6 27.1 17.5 26.3L18.4 24.4Z"
              fill="#FFFFFF"
            />
          </svg>
        );

      case 'JavaScript':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="6" fill="#F7DF1E" />
            <path
              d="M14.8 22.7C14.8 25.1 13.4 26.4 11.1 26.4C9.5 26.4 8.4 25.7 7.8 24.6L9.8 23.4C10.1 24 10.6 24.4 11.2 24.4C12 24.4 12.4 24 12.4 22.6V14.7H14.8V22.7ZM16.9 24.5C17.8 25.3 19.1 25.8 20.6 25.8C22.2 25.8 23.1 25 23.1 23.8C23.1 22.8 22.4 22.3 20.7 21.7L19.6 21.3C17.7 20.6 16.6 19.6 16.6 17.9C16.6 15.9 18.3 14.5 20.7 14.5C22.2 14.5 23.4 14.9 24.3 15.6L23.1 17.6C22.4 17 21.6 16.7 20.7 16.7C19.6 16.7 19 17.2 19 17.9C19 18.6 19.6 19.1 21.1 19.6L22.2 20C24.3 20.7 25.5 21.8 25.5 23.7C25.5 26.1 23.5 27.8 20.5 27.8C18.6 27.8 17 27.2 15.9 26.3L16.9 24.5Z"
              fill="#18181B"
            />
          </svg>
        );

      case 'HTML':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <path d="M5 4L7 25.5L16 28L25 25.5L27 4H5Z" fill="#E34F26" />
            <path d="M16 5.8V26.1L23.2 24.1L24.8 5.8H16Z" fill="#EF652A" />
            <path
              d="M10.2 9.5H21.8L21.5 12.2H12.9L13.2 15H21.2L20.5 22.2L16 23.5L11.5 22.2L11.2 18.7H13.9L14.1 20.2L16 20.8L17.9 20.2L18.2 17.6H10.8L10.2 9.5Z"
              fill="#FFFFFF"
            />
          </svg>
        );

      case 'CSS':
      case 'CSS Architecture':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <path d="M5 4L7 25.5L16 28L25 25.5L27 4H5Z" fill="#1572B6" />
            <path d="M16 5.8V26.1L23.2 24.1L24.8 5.8H16Z" fill="#33A9DC" />
            <path
              d="M10.2 9.5H21.8L21.5 12.2H15.8L12.8 13.5H21.2L20.5 22.2L16 23.5L11.5 22.2L11.2 18.8H13.9L14.1 20.2L16 20.8L17.9 20.2L18.2 16.2H11L10.7 13.6L16 11.4H10.4L10.2 9.5Z"
              fill="#FFFFFF"
            />
          </svg>
        );

      case 'React':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <circle cx="16" cy="16" r="2.6" fill="#00D8FF" />
            <g fill="none" stroke="#00D8FF" strokeWidth="1.7">
              <ellipse cx="16" cy="16" rx="12" ry="4.7" />
              <ellipse cx="16" cy="16" rx="12" ry="4.7" transform="rotate(60 16 16)" />
              <ellipse cx="16" cy="16" rx="12" ry="4.7" transform="rotate(120 16 16)" />
            </g>
          </svg>
        );

      case 'Next.js':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <circle cx="16" cy="16" r="13.5" fill="#111111" stroke="#3F3F46" strokeWidth="1" />
            <path
              d="M11 22V10.5H13.2L21.2 21.8L22.6 23.6L19.8 23.2L13.1 13.9V22H11ZM19.3 10.5H21.3V18.5L19.3 15.8V10.5Z"
              fill="#FFFFFF"
            />
          </svg>
        );

      case 'Vue':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <path d="M3.5 6.5H12.5L16 12.6L19.5 6.5H28.5L16 27.5L3.5 6.5Z" fill="#41B883" />
            <path d="M8.5 6.5H12.5L16 12.6L19.5 6.5H23.5L16 19.3L8.5 6.5Z" fill="#35495E" />
          </svg>
        );

      case 'Svelte':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#FF3E00" />
            <path
              d="M21.4 8.8C19.5 6.1 15.7 5.4 13 7.3L9.4 9.7C7.6 10.9 6.6 13.1 7 15.3C7.2 16.3 7.7 17.2 8.4 17.9C8 18.8 7.9 19.8 8.1 20.8C8.5 23.2 10.3 25.1 12.7 25.6C14.1 25.9 15.6 25.6 16.8 24.8L20.4 22.4C22.2 21.2 23.2 19 22.8 16.8C22.6 15.8 22.1 14.9 21.4 14.2C21.8 13.3 21.9 12.3 21.7 11.3C21.6 10.4 21.8 9.5 21.4 8.8ZM14.5 22.2C13 22.6 11.5 21.7 11.1 20.2C10.9 19.5 11.1 18.8 11.4 18.2L11.7 17.7L12.2 18.1C13 18.7 13.9 19.1 14.8 19.3L15.1 19.4L15.1 19.8C15 20.2 15.1 20.6 15.4 20.9C15.9 21.5 16.7 21.6 17.4 21.2L21 18.8C21.4 18.5 21.6 18 21.5 17.5C21.4 17.1 21.1 16.8 20.7 16.6L16.3 15.3C14.7 14.8 13.4 13.5 13 11.8C12.6 10 13.4 8.1 14.9 7.1L18.5 4.7"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.1"
              strokeLinecap="round"
            />
          </svg>
        );

      case 'Tailwind CSS':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <path
              d="M16 7.5C11.7 7.5 9 9.6 7.9 13.9C9.5 11.8 11.4 11 13.6 11.5C14.8 11.8 15.7 12.7 16.7 13.7C18.3 15.3 20.2 17.2 24.1 17.2C28.4 17.2 31.1 15.1 32.1 10.8C30.5 12.9 28.6 13.7 26.4 13.2C25.2 12.9 24.3 12 23.3 11C21.7 9.4 19.8 7.5 16 7.5ZM7.9 17.2C3.6 17.2 0.9 19.3 0 23.6C1.6 21.5 3.5 20.7 5.7 21.2C6.9 21.5 7.8 22.4 8.8 23.4C10.4 25 12.3 26.9 16.2 26.9C20.5 26.9 23.2 24.8 24.2 20.5C22.6 22.6 20.7 23.4 18.5 22.9C17.3 22.6 16.4 21.7 15.4 20.7C13.8 19.1 11.9 17.2 7.9 17.2Z"
              fill="#06B6D4"
            />
          </svg>
        );

      case 'Python':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <path
              d="M15.8 4C11.4 4 11.7 5.9 11.7 5.9L11.7 8.8H16V9.8H9.5C9.5 9.8 6 9.4 6 14.3C6 19.2 9.1 19 9.1 19H11V16.6C11 16.6 10.9 13.5 14 13.5H19.4C19.4 13.5 22.2 13.6 22.2 10.8V6.7C22.2 6.7 22.7 4 15.8 4ZM13.7 5.7C14.3 5.7 14.8 6.2 14.8 6.8C14.8 7.4 14.3 7.9 13.7 7.9C13.1 7.9 12.6 7.4 12.6 6.8C12.6 6.2 13.1 5.7 13.7 5.7Z"
              fill="#3776AB"
            />
            <path
              d="M16.2 28C20.6 28 20.3 26.1 20.3 26.1L20.3 23.2H16V22.2H22.5C22.5 22.2 26 22.6 26 17.7C26 12.8 22.9 13 22.9 13H21V15.4C21 15.4 21.1 18.5 18 18.5H12.6C12.6 18.5 9.8 18.4 9.8 21.2V25.3C9.8 25.3 9.3 28 16.2 28ZM18.3 26.3C17.7 26.3 17.2 25.8 17.2 25.2C17.2 24.6 17.7 24.1 18.3 24.1C18.9 24.1 19.4 24.6 19.4 25.2C19.4 25.8 18.9 26.3 18.3 26.3Z"
              fill="#FFD43B"
            />
          </svg>
        );

      case 'Rust':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <circle cx="16" cy="16" r="11.5" fill="#18181B" stroke="#EA580C" strokeWidth="2.5" strokeDasharray="3.2 1.8" />
            <circle cx="16" cy="16" r="8.5" fill="none" stroke="#F97316" strokeWidth="1.2" />
            <path
              d="M11.5 21V11.5H17C19 11.5 20.3 12.6 20.3 14.3C20.3 15.7 19.4 16.7 17.8 17L20.6 21H17.8L15.4 17.3H13.9V21H11.5ZM13.9 15.4H16.6C17.5 15.4 18 15 18 14.3C18 13.6 17.5 13.2 16.6 13.2H13.9V15.4Z"
              fill="#FFFFFF"
            />
          </svg>
        );

      case 'Go':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#00ADD8" />
            <path
              d="M6.2 14.5H12.5V16.8H8.6V19.6H12.2V21.7C10.9 22.4 9.5 22.8 8 22.8C5.4 22.8 3.8 21 3.8 18.3C3.8 15.6 5.5 14.5 6.2 14.5ZM6.5 11.5C7.9 10.3 9.7 9.8 11.8 10.1L11.2 12.3C9.6 12 8.2 12.4 7.2 13.4C6.1 14.6 6.2 19.9 8.7 20.3C9.7 20.4 10.4 20.1 10.4 20.1V17.4H8.6V15.3H12.9V21.5C11.7 22.4 10.2 22.9 8.5 22.9C5.3 22.9 3.4 20.6 3.4 17.4C3.4 14.9 4.7 12.9 6.5 11.5Z"
              fill="#FFFFFF"
              opacity="0"
            />
            <text
              x="16"
              y="20.5"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="12.5"
              fontWeight="800"
              fontFamily="system-ui, sans-serif"
              letterSpacing="-0.5"
            >
              GO
            </text>
          </svg>
        );

      case 'Node.js':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <polygon points="16,3 27.5,9.5 27.5,22.5 16,29 4.5,22.5 4.5,9.5" fill="#339933" />
            <text
              x="16"
              y="19.5"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="10"
              fontWeight="800"
              fontFamily="system-ui, sans-serif"
            >
              JS
            </text>
          </svg>
        );

      case 'PostgreSQL':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#336791" />
            <path
              d="M21.5 9.2C19.6 8.2 17.2 8.6 16 9.8C14.8 8.6 12.4 8.2 10.5 9.2C8.1 10.5 7.4 13.7 8.4 16.9C9.3 19.6 11.2 21.1 12.9 21.2C13.6 21.2 14.2 21 14.5 20.6V23.8C14.5 24.8 15.2 25.5 16.2 25.5C17.2 25.5 17.9 24.8 17.9 23.8V19.6C18.5 20.4 19.5 20.9 20.5 20.6C22.4 20.1 23.6 17.9 23.8 15.1C24 12.4 23.2 10.1 21.5 9.2Z"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="13.2" cy="13.5" r="1.1" fill="#FFFFFF" />
            <circle cx="18.8" cy="13.5" r="1.1" fill="#FFFFFF" />
          </svg>
        );

      case 'SQLite':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#0F80CC" />
            <ellipse cx="16" cy="10.5" rx="7.5" ry="2.8" fill="none" stroke="#FFFFFF" strokeWidth="1.9" />
            <path
              d="M8.5 10.5V21.5C8.5 23 11.9 24.3 16 24.3C20.1 24.3 23.5 23 23.5 21.5V10.5"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.9"
            />
            <path
              d="M8.5 16C8.5 17.5 11.9 18.8 16 18.8C20.1 18.8 23.5 17.5 23.5 16"
              fill="none"
              stroke="#BAE6FD"
              strokeWidth="1.6"
            />
          </svg>
        );

      case 'MongoDB':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#133A26" />
            <path
              d="M16 5.5C16 5.5 21.5 11.2 21.5 17.2C21.5 21.5 18.5 24.5 16.6 25.5V27.2H15.4V25.5C13.5 24.5 10.5 21.5 10.5 17.2C10.5 11.2 16 5.5 16 5.5Z"
              fill="#47A248"
            />
            <path d="M16 7.5V25" stroke="#A7F3D0" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        );

      case 'Supabase':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#18181B" />
            <path
              d="M17.2 26.8C16.6 27.6 15.3 27.1 15.3 26.1V17.4H24.2C25.4 17.4 26.1 18.8 25.3 19.8L17.2 26.8Z"
              fill="#3ECF8E"
            />
            <path
              d="M14.8 5.2C15.4 4.4 16.7 4.9 16.7 5.9V14.6H7.8C6.6 14.6 5.9 13.2 6.7 12.2L14.8 5.2Z"
              fill="#249361"
            />
          </svg>
        );

      case 'Firebase':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <path d="M7.5 23.2L10.8 6.8C11 5.9 12.2 5.7 12.6 6.5L16.3 13.5L7.5 23.2Z" fill="#FFA000" />
            <path d="M7.5 23.2L18.2 12.3C18.8 11.7 19.8 12 20 12.8L23.5 23.2L16 27.5L7.5 23.2Z" fill="#FFCA28" />
            <path d="M23.5 23.2L21.3 9.7C21.1 8.8 19.9 8.5 19.3 9.2L7.5 23.2L16 27.5L23.5 23.2Z" fill="#F57C00" opacity="0.88" />
          </svg>
        );

      case 'Docker':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#2496ED" />
            <g fill="#FFFFFF">
              <rect x="8" y="13" width="3" height="2.8" rx="0.4" />
              <rect x="11.8" y="13" width="3" height="2.8" rx="0.4" />
              <rect x="15.6" y="13" width="3" height="2.8" rx="0.4" />
              <rect x="11.8" y="9.5" width="3" height="2.8" rx="0.4" />
              <rect x="15.6" y="9.5" width="3" height="2.8" rx="0.4" />
              <path d="M5.5 17H22.2C23.4 17 24.8 16.4 25.4 15.2C26.3 15.7 26.8 16.8 26.5 18C25.8 21.2 22.3 23.8 15.5 23.8C9.8 23.8 6.4 21 5.5 17Z" />
            </g>
          </svg>
        );

      case 'WebAssembly':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <path
              d="M4 5H12.2C12.2 7.1 13.9 8.8 16 8.8C18.1 8.8 19.8 7.1 19.8 5H28V27H4V5Z"
              fill="#654FF0"
            />
            <text
              x="16"
              y="22"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="10"
              fontWeight="800"
              fontFamily="system-ui, sans-serif"
            >
              WA
            </text>
          </svg>
        );

      case 'WebGL / GLSL':
      case 'Three.js':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect
              width="32"
              height="32"
              rx="7"
              fill={canonical === 'Three.js' ? '#111827' : '#990000'}
            />
            <polygon
              points="16,5.5 26,11.2 26,21.8 16,27.5 6,21.8 6,11.2"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.9"
              strokeLinejoin="round"
            />
            <path
              d="M16 5.5V16.5M16 16.5L26 11.2M16 16.5L6 11.2M16 16.5V27.5"
              stroke="#FCA5A5"
              strokeWidth="1.4"
            />
          </svg>
        );

      case 'TensorFlow.js':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#FFF7ED" />
            <path d="M16.6 5.5L25.5 10.6V14.7L19.9 11.5V15.4L23.1 17.2V20.9L19.9 19V26.2L16.6 24.3V5.5Z" fill="#FF6F00" />
            <path d="M15.4 5.5L6.5 10.6V14.7L12.1 11.5V26.2L15.4 24.3V5.5Z" fill="#FFA800" />
          </svg>
        );

      case 'PyTorch':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#EE4C2C" />
            <path
              d="M21.2 12.1C23.5 14.5 23.5 18.4 21.2 20.8C18.9 23.2 15.1 23.2 12.8 20.8C10.5 18.4 10.5 14.5 12.8 12.1L16.5 8.3V11.8L14.6 13.8C13.3 15.2 13.3 17.5 14.6 18.9C15.9 20.3 18.1 20.3 19.4 18.9C20.7 17.5 20.7 15.2 19.4 13.8L21.2 12.1Z"
              fill="#FFFFFF"
            />
            <circle cx="19.8" cy="10.2" r="1.5" fill="#FFFFFF" />
          </svg>
        );

      case 'Java':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#1E293B" />
            <path
              d="M11 16H21V20.2C21 22.8 18.8 24.6 16 24.6C13.2 24.6 11 22.8 11 20.2V16ZM21 17H22.6C23.6 17 24.3 17.7 24.3 18.7C24.3 19.7 23.6 20.4 22.6 20.4H21"
              fill="none"
              stroke="#FB923C"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path d="M13.5 13C12.8 11.5 14.7 10.3 14 8.5M17.5 13C16.8 11.5 18.7 10.3 18 8.5" stroke="#60A5FA" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        );

      case 'C':
      case 'C++':
      case 'C#':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <polygon
              points="16,3 27.5,9.5 27.5,22.5 16,29 4.5,22.5 4.5,9.5"
              fill={canonical === 'C#' ? '#512BD4' : '#00599C'}
            />
            <text
              x="16"
              y="19.5"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize={canonical === 'C++' ? '10.5' : '12'}
              fontWeight="800"
              fontFamily="system-ui, sans-serif"
            >
              {canonical}
            </text>
          </svg>
        );

      case 'PHP':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <ellipse cx="16" cy="16" rx="14" ry="9.5" fill="#777BB4" />
            <text
              x="16"
              y="19.2"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="9.5"
              fontWeight="800"
              fontStyle="italic"
              fontFamily="system-ui, sans-serif"
            >
              php
            </text>
          </svg>
        );

      case 'Swift':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#F05138" />
            <path
              d="M23.5 20.5C24.5 17.8 23.6 13.7 20.2 10.4C21.5 13.2 21.1 15.8 19.6 17.4C16.9 15.2 13.8 12.1 11.4 9.5C12.7 12.2 14.4 14.5 16.5 16.5C13.7 14.7 11.1 12.6 8.8 10.2C10.5 13.4 12.9 16.3 15.8 18.6C13.2 19.6 10.4 19.3 7.8 17.7C10.1 21.3 14.6 23.1 19 22.1C20.5 21.8 22.1 22.4 23.5 23.6C23.9 22.5 23.8 21.4 23.5 20.5Z"
              fill="#FFFFFF"
            />
          </svg>
        );

      case 'Kotlin':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <defs>
              <linearGradient id="kotlin-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#E44857" />
                <stop offset="50%" stopColor="#C711E1" />
                <stop offset="100%" stopColor="#7F52FF" />
              </linearGradient>
            </defs>
            <polygon points="5,5 27,5 16,16 27,27 5,27" fill="url(#kotlin-grad)" />
          </svg>
        );

      case 'Figma':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#18181B" />
            <path d="M12.5 11.5C10.8 11.5 9.5 10.2 9.5 8.5C9.5 6.8 10.8 5.5 12.5 5.5H15.5V11.5H12.5Z" fill="#F24E1E" />
            <path d="M15.5 5.5H18.5C20.2 5.5 21.5 6.8 21.5 8.5C21.5 10.2 20.2 11.5 18.5 11.5H15.5V5.5Z" fill="#FF7262" />
            <path d="M12.5 17.5C10.8 17.5 9.5 16.2 9.5 14.5C9.5 12.8 10.8 11.5 12.5 11.5H15.5V17.5H12.5Z" fill="#A259FF" />
            <circle cx="18.5" cy="14.5" r="3" fill="#1ABCFE" />
            <path d="M12.5 23.5C10.8 23.5 9.5 22.2 9.5 20.5C9.5 18.8 10.8 17.5 12.5 17.5H15.5V20.5C15.5 22.2 14.2 23.5 12.5 23.5Z" fill="#0ACF83" />
          </svg>
        );

      case 'LLVM':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#262D3A" />
            <path
              d="M9 11.5L16 7.5L23 11.5V19.8L16 24.5L9 19.8V11.5Z"
              fill="none"
              stroke="#93C5FD"
              strokeWidth="1.9"
            />
            <path d="M12.5 14.5H19.5M12.5 18H17.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          </svg>
        );

      case 'Git':
      case 'GitHub':
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect
              width="32"
              height="32"
              rx="7"
              fill={canonical === 'GitHub' ? '#18181B' : '#F05032'}
            />
            <circle cx="11.5" cy="10.5" r="2.2" fill="#FFFFFF" />
            <circle cx="11.5" cy="21.5" r="2.2" fill="#FFFFFF" />
            <circle cx="20.5" cy="14.5" r="2.2" fill="#FFFFFF" />
            <path
              d="M11.5 12.7V19.3M11.5 12.7C14 14.5 17 14.5 18.3 14.5"
              stroke="#FFFFFF"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        );

      default: {
        const mono = getFallbackMonogram(canonical || name);
        return (
          <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="7" fill={meta.accent} />
            <text
              x="16"
              y="20"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize={mono.length > 2 ? '9.5' : '11.5'}
              fontWeight="800"
              fontFamily="system-ui, sans-serif"
            >
              {mono}
            </text>
          </svg>
        );
      }
    }
  };

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {renderGraphic()}
    </span>
  );
};
