import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "'Toss Product Sans'",
          "'Pretendard Variable'",
          "Pretendard",
          "-apple-system",
          "system-ui",
          "sans-serif",
        ],
        mono: ["'DM Mono'", "'JetBrains Mono'", "monospace"],
        emoji: ["'Tossface'", "sans-serif"],
      },
      fontSize: {
        micro: "10px",
        xs: "11px",
        sm: "12px",
        md: "13.5px",
        lg: "15px",
        xl: "17px",
        "2xl": "22px",
        "3xl": "28px",
      },
      colors: {
        // 브랜드 (TDS)
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          light: "var(--brand-light)",
          mid: "var(--brand-mid)",
          pale: "var(--brand-pale)",
        },
        // 시맨틱
        success: {
          DEFAULT: "var(--success)",
          light: "var(--success-light)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          light: "var(--warning-light)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          light: "var(--danger-light)",
        },
        info: {
          DEFAULT: "var(--info)",
          light: "var(--info-light)",
        },
        // 그레이스케일 (12단계)
        g: {
          900: "var(--g900)",
          800: "var(--g800)",
          700: "var(--g700)",
          600: "var(--g600)",
          500: "var(--g500)",
          400: "var(--g400)",
          300: "var(--g300)",
          200: "var(--g200)",
          150: "var(--g150)",
          100: "var(--g100)",
          50: "var(--g50)",
        },
        // 카테고리
        category: {
          "field-note": "var(--category-field-note)",
          "ip-lounge": "var(--category-ip-lounge)",
          diary: "var(--category-diary)",
          intro: "var(--category-intro)",
          consult: "var(--category-consult)",
        },
        // 상태
        status: {
          s0: "var(--status-s0)",
          s1: "var(--status-s1)",
          s2: "var(--status-s2)",
          s3: "var(--status-s3)",
          s4: "var(--status-s4)",
          s5: "var(--status-s5)",
        },
        // 품질
        quality: {
          excellent: "var(--quality-excellent)",
          good: "var(--quality-good)",
          average: "var(--quality-average)",
          poor: "var(--quality-poor)",
          critical: "var(--quality-critical)",
        },
        // SEO
        seo: {
          required: "var(--seo-required)",
          recommended: "var(--seo-recommended)",
          optional: "var(--seo-optional)",
        },
        // SLA
        sla: {
          "on-track": "var(--sla-on-track)",
          warning: "var(--sla-warning)",
          overdue: "var(--sla-overdue)",
          future: "var(--sla-future)",
        },
        // shadcn/ui 호환
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        xs: "var(--r-xs)",
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
        full: "var(--r-full)",
      },
      boxShadow: {
        sm: "var(--sh-sm)",
        md: "var(--sh-md)",
        lg: "var(--sh-lg)",
        card: "var(--sh-sm)",
        "card-hover": "var(--sh-md)",
        dropdown: "var(--sh-md)",
        modal: "var(--sh-lg)",
      },
      spacing: {
        sidebar: "var(--sidebar-width)",
        "sidebar-collapsed": "var(--sidebar-collapsed-width)",
        header: "var(--header-height)",
      },
      transitionDuration: {
        fast: "150ms",
        normal: "200ms",
        slow: "300ms",
      },
      width: {
        sidebar: "var(--sidebar-width)",
        "sidebar-collapsed": "var(--sidebar-collapsed-width)",
      },
      zIndex: {
        base: "1",
        dropdown: "100",
        sticky: "200",
        overlay: "300",
        modal: "400",
        toast: "500",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
