use std::sync::{Arc, Mutex};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum LocalAiTask {
    Dictation,
    Transform,
}

impl LocalAiTask {
    fn label(self) -> &'static str {
        match self {
            Self::Dictation => "Dictation",
            Self::Transform => "Transform",
        }
    }
}

#[derive(Clone, Default)]
pub struct LocalAiGate(Arc<Mutex<Option<(LocalAiTask, String)>>>);

impl LocalAiGate {
    pub fn claim(&self, task: LocalAiTask, session_id: &str) -> Result<(), String> {
        let mut active = self
            .0
            .lock()
            .map_err(|_| "Local AI activity state is unavailable.".to_owned())?;
        if let Some((current, _)) = active.as_ref() {
            return Err(format!(
                "{} is active. Finish or cancel it before starting {}.",
                current.label(),
                task.label()
            ));
        }
        *active = Some((task, session_id.to_owned()));
        Ok(())
    }

    pub fn release(&self, task: LocalAiTask, session_id: &str) {
        if let Ok(mut active) = self.0.lock()
            && active
                .as_ref()
                .is_some_and(|(current, id)| *current == task && id == session_id)
        {
            *active = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mutually_excludes_local_ai_tasks() {
        let gate = LocalAiGate::default();
        gate.claim(LocalAiTask::Dictation, "dictation").unwrap();
        assert!(
            gate.claim(LocalAiTask::Transform, "transform")
                .unwrap_err()
                .contains("Dictation is active")
        );
        gate.release(LocalAiTask::Dictation, "other");
        assert!(gate.claim(LocalAiTask::Transform, "transform").is_err());
        gate.release(LocalAiTask::Dictation, "dictation");
        gate.claim(LocalAiTask::Transform, "transform").unwrap();
    }
}
