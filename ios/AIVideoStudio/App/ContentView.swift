import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            CreateView()
                .tabItem { Label("Create", systemImage: "sparkles.tv") }
            ProjectsView()
                .tabItem { Label("Videos", systemImage: "film.stack") }
            ModelsView()
                .tabItem { Label("Models", systemImage: "cpu") }
            SettingsView()
                .tabItem { Label("Studio", systemImage: "slider.horizontal.3") }
        }
    }
}
