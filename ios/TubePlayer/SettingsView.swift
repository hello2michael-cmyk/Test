import SwiftUI
import WebKit

struct SettingsView: View {
    @AppStorage("youtubeAPIKey") private var apiKey = ""
    @EnvironmentObject private var library: Library
    @State private var showSignIn = false
    @State private var showSignedOut = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button {
                        showSignIn = true
                    } label: {
                        Label("Sign in to YouTube", systemImage: "person.crop.circle")
                    }
                    Button(role: .destructive) {
                        signOut()
                    } label: {
                        Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                } header: {
                    Text("YouTube account")
                } footer: {
                    Text("Sign in with a YouTube Premium account and videos play without ads. Without Premium, YouTube shows its usual ads in the player.")
                }

                Section {
                    TextField("API key", text: $apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Link("How to get a free key", destination: URL(string: "https://github.com/hello2michael-cmyk/Test#search-key")!)
                } header: {
                    Text("Search")
                } footer: {
                    Text("Search needs a free YouTube Data API key from Google. Pasting links works without one.")
                }

                Section("Library") {
                    Button("Clear watch history", role: .destructive) {
                        library.clearHistory()
                    }
                }

                Section("About") {
                    Text("Tube Player plays videos through YouTube's own player. Your account, history and saved videos stay on this phone.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .sheet(isPresented: $showSignIn) { SignInView() }
            .alert("Signed out", isPresented: $showSignedOut) {
                Button("OK") {}
            }
        }
    }

    private func signOut() {
        Task { @MainActor in
            let store = WKWebsiteDataStore.default()
            await store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast)
            showSignedOut = true
        }
    }
}
