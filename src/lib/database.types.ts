export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; created_at: string };
        Insert: { id: string; created_at?: string };
        Update: { id?: string; created_at?: string };
        Relationships: [];
      };
      categories: {
        Row: { id: string; user_id: string; name: string; emoji: string; is_archived: boolean; created_at: string };
        Insert: { id?: string; user_id?: string; name: string; emoji?: string; is_archived?: boolean; created_at?: string };
        Update: { id?: string; user_id?: string; name?: string; emoji?: string; is_archived?: boolean; created_at?: string };
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          amount: number;
          note: string | null;
          spent_at: string;
          spent_on: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          category_id: string;
          amount: number;
          note?: string | null;
          spent_at?: string;
          spent_on?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          category_id?: string;
          amount?: number;
          note?: string | null;
          spent_at?: string;
          spent_on?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_category_owner_fkey";
            columns: ["category_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
