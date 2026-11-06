import Foundation
import Combine
import UIKit

/// Drives one production run and exposes its state to the Create screen.
@MainActor
final class GenerationViewModel: ObservableObject {
    @Published var prompt: String = ""
    @Published private(set) var events: [AgentEvent] = []
    @Published private(set) var streaming: String = ""
    @Published private(set) var progress: GenerationProgress?
    @Published private(set) var isRunning = false
    @Published var errorMessage: String?
    @Published private(set) var finished: Project?
    @Published private(set) var startedAt: Date?

    private var task: Task<Void, Never>?

    static let samplePrompts = [
        "Explain what a transformer attention head does, for curious beginners",
        "Why do large language models hallucinate? Three causes and one fix",
        "Retrieval-augmented generation in one minute",
        "What is a token, and why does it change the price of an API call?",
        "Fine-tuning vs prompting: when to use which",
    ]

    func start(models: ModelManager, store: ProjectStore, settings: RenderSettings) {
        let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isRunning else { return }
        events = []
        streaming = ""
        finished = nil
        errorMessage = nil
        isRunning = true
        startedAt = Date()
        progress = GenerationProgress(stage: .planning, fraction: 0, detail: "Loading model")
        UIApplication.shared.isIdleTimerDisabled = true

        let (id, folder) = store.newProjectFolder()
        task = Task { [weak self] in
            guard let self else { return }
            do {
                let engine = try await models.ensureEngine()
                self.append(AgentEvent(agent: "Studio", level: .info, message: "Model “\(engine.modelName)” is ready. Everything runs on this phone."))
                let orchestrator = Orchestrator(engine: engine, settings: settings, projectFolder: folder,
                                                log: { [weak self] event in Task { @MainActor in self?.append(event) } },
                                                progress: { [weak self] p in Task { @MainActor in self?.progress = p } })
                let plan = try await orchestrator.produce(prompt: text)
                let project = Project(id: id, createdAt: Date(), prompt: text, title: plan.publish.title,
                                      duration: plan.totalDuration, aspect: settings.aspect)
                store.add(project)
                self.finished = project
                let elapsed = Int(Date().timeIntervalSince(self.startedAt ?? Date()))
                self.append(AgentEvent(agent: "Studio", level: .success, message: "Done in \(elapsed / 60) min \(elapsed % 60) s. Open the Videos tab to watch, share and copy the YouTube text."))
            } catch is CancellationError {
                store.discard(folder: folder)
                self.append(AgentEvent(agent: "Studio", level: .warning, message: "Cancelled."))
            } catch LLMError.cancelled {
                store.discard(folder: folder)
                self.append(AgentEvent(agent: "Studio", level: .warning, message: "Cancelled."))
            } catch {
                store.discard(folder: folder)
                self.errorMessage = error.localizedDescription
                self.append(AgentEvent(agent: "Studio", level: .error, message: error.localizedDescription))
            }
            self.isRunning = false
            self.progress = nil
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }

    func cancel() {
        task?.cancel()
    }

    private func append(_ event: AgentEvent) {
        if event.level == .token {
            streaming += event.message
            if streaming.count > 900 { streaming = String(streaming.suffix(900)) }
            return
        }
        streaming = ""
        events.append(event)
        if events.count > 300 { events.removeFirst(events.count - 300) }
    }
}
