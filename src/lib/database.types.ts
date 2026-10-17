// Mirrors supabase/schema.sql. Regenerate after schema changes with:
//   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type Confidence = 'low' | 'medium' | 'high'
export type MealInputType = 'text' | 'photo'
export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string | null
          display_name: string | null
          sex: Sex | null
          age_years: number | null
          height_cm: number | null
          weight_kg: number | null
          activity_level: ActivityLevel | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          display_name?: string | null
          sex?: Sex | null
          age_years?: number | null
          height_cm?: number | null
          weight_kg?: number | null
          activity_level?: ActivityLevel | null
        }
        Update: {
          email?: string | null
          display_name?: string | null
          sex?: Sex | null
          age_years?: number | null
          height_cm?: number | null
          weight_kg?: number | null
          activity_level?: ActivityLevel | null
        }
        Relationships: []
      }
      daily_goals: {
        Row: {
          id: string
          user_id: string
          effective_from: string
          tdee_kcal: number
          calorie_target_kcal: number
          protein_g: number
          carbs_g: number
          fat_g: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          effective_from?: string
          tdee_kcal: number
          calorie_target_kcal: number
          protein_g: number
          carbs_g: number
          fat_g: number
        }
        Update: {
          effective_from?: string
          tdee_kcal?: number
          calorie_target_kcal?: number
          protein_g?: number
          carbs_g?: number
          fat_g?: number
        }
        Relationships: []
      }
      meals: {
        Row: {
          id: string
          user_id: string
          description: string
          meal_name: string
          meal_type: MealType
          eaten_at: string
          calories: number
          protein_g: number
          carbs_g: number
          fat_g: number
          items: Json
          confidence: Confidence | null
          ai_notes: string | null
          ai_model: string | null
          source: 'ai' | 'edited'
          input_type: MealInputType
          photo_thumb: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          description: string
          meal_name: string
          meal_type?: MealType
          eaten_at?: string
          calories: number
          protein_g: number
          carbs_g: number
          fat_g: number
          items?: Json
          confidence?: Confidence | null
          ai_notes?: string | null
          ai_model?: string | null
          source?: 'ai' | 'edited'
          input_type?: MealInputType
          photo_thumb?: string | null
        }
        Update: {
          description?: string
          meal_name?: string
          meal_type?: MealType
          eaten_at?: string
          calories?: number
          protein_g?: number
          carbs_g?: number
          fat_g?: number
          items?: Json
          confidence?: Confidence | null
          ai_notes?: string | null
          ai_model?: string | null
          source?: 'ai' | 'edited'
          input_type?: MealInputType
          photo_thumb?: string | null
        }
        Relationships: []
      }
      user_memories: {
        Row: {
          id: string
          user_id: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          content: string
        }
        Update: {
          content?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          id: string
          user_id: string
          role: 'user' | 'assistant'
          content: string
          photo_thumbs: Json
          actions: Json
          model: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          role: 'user' | 'assistant'
          content?: string
          photo_thumbs?: Json
          actions?: Json
          model?: string | null
          created_at?: string
        }
        Update: {
          actions?: Json
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicTables = Database['public']['Tables']
export type Tables<T extends keyof PublicTables> = PublicTables[T]['Row']
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]['Insert']
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]['Update']
