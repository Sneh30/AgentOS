-- Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (linked to Supabase Auth and Clerk)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  clerk_id TEXT UNIQUE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  provider TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on clerk_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed')),
  input TEXT NOT NULL,
  plan JSONB,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task steps table
CREATE TABLE IF NOT EXISTS task_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  tool_input JSONB NOT NULL,
  tool_output JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed')),
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Executions log
CREATE TABLE IF NOT EXISTS executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  step_id UUID REFERENCES task_steps(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  input JSONB,
  output JSONB,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Memory nodes table
CREATE TABLE IF NOT EXISTS memory_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('fact', 'preference', 'context', 'interaction', 'task_summary', 'key_output')),
  content TEXT NOT NULL,
  source TEXT,
  metadata JSONB DEFAULT '{}',
  importance INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GTM Agent Library — named, reusable workflows composed from GTM toolkits + memory + browser
CREATE TABLE IF NOT EXISTS gtm_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  goal_template TEXT NOT NULL,
  toolkits JSONB NOT NULL DEFAULT '[]',
  input_schema JSONB NOT NULL DEFAULT '{}',
  trigger TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'schedule', 'webhook')),
  schedule TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'disabled')),
  source TEXT NOT NULL DEFAULT 'custom' CHECK (source IN ('template', 'generated', 'custom')),
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop Agent Foundry's runtime-codegen table — replaced by the declarative gtm_agents
-- pipeline (see src/lib/agents/generate.ts). No code is ever generated or sandboxed now.
DROP TABLE IF EXISTS generated_tools;

-- gtm_agents needs an agent_id FK on tasks so a task can be traced back to the agent run it belongs to
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES gtm_agents(id) ON DELETE SET NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_steps_task_id ON task_steps(task_id);
CREATE INDEX IF NOT EXISTS idx_executions_task_id ON executions(task_id);
CREATE INDEX IF NOT EXISTS idx_executions_user_id ON executions(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_user_id ON memory_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_type ON memory_nodes(type);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_created_at ON memory_nodes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gtm_agents_status ON gtm_agents(status);
CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gtm_agents ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can only access their own data via auth.uid())
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can manage own tasks" ON tasks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own task steps" ON task_steps
  FOR ALL USING (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_steps.task_id AND tasks.user_id = auth.uid())
  );

CREATE POLICY "Users can manage own executions" ON executions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own memories" ON memory_nodes
  FOR ALL USING (auth.uid() = user_id);

-- Shared agent library: any authenticated user can see and run every agent (org-wide),
-- but only the creator (or a NULL created_by seed/template row) can edit or delete it.
CREATE POLICY "Anyone authenticated can view gtm agents" ON gtm_agents
  FOR SELECT USING (true);

CREATE POLICY "Users can create gtm agents" ON gtm_agents
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own gtm agents" ON gtm_agents
  FOR UPDATE USING (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Users can delete own gtm agents" ON gtm_agents
  FOR DELETE USING (auth.uid() = created_by OR created_by IS NULL);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_memory_nodes_updated_at BEFORE UPDATE ON memory_nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_gtm_agents_updated_at BEFORE UPDATE ON gtm_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create user profile when they sign up via trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, avatar_url, provider)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_app_meta_data->>'provider'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create user on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
