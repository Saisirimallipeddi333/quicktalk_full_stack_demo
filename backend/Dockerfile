# ---- Build stage: use Maven + Java 17 ----
FROM maven:3.9-eclipse-temurin-17 AS build

WORKDIR /app

# Copy pom first and download dependencies (cache-friendly)
COPY pom.xml .
RUN mvn -q -e -B -DskipTests dependency:go-offline

# Now copy the source code and build the jar
COPY src ./src
RUN mvn -q -e -B -DskipTests package

# ---- Runtime stage: only JRE + built jar ----
FROM eclipse-temurin:17-jre AS runtime

WORKDIR /app

# Copy the built jar from the build stage
COPY --from=build /app/target/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
