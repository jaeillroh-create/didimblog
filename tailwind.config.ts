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
          '"Pretendard Variable"',
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
        mono: ['"JetBrains Mono"', '"Fira Code"', "Consolas", "monospace"],
      },
      fontSize: {
        xs: "0.75rem",
        sm: "0.8125rem",
        base: "0.875rem",
        md: "1rem",
        lg: "1.125rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
        "3xl": "1.875rem",
      },
      colors: {
        // 브랜드
        brand: {
          primary: "var(--brand-primary)",
          accent: "var(--brand-accent)",
          cta: "var(--brand-cta)",
          "cta-hover": "var(--brand-cta-hover)",
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
        // 시맨틱
        semantic: {
          success: "var(--semantic-success)",
          warning: "var(--semantic-warning)",
          error: "var(--semantic-error)",
          info: "var(--semantic-info)",
        },
        // 뉴트럴
        sidebar: {
          DEFAULT: "var(--neutral-sidebar)",
          hover: "var(--neutral-sidebar-hover)",
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
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        dropdown: "var(--shadow-dropdown)",
        modal: "var(--shadow-modal)",
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
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
